// Routine (repeating weekly items), the calendar and the dashboard agenda.
import express from 'express';
import { z } from 'zod';
import { query, tx } from './db.js';
import { noteOut } from './attachments.js';
import { addDays, date, daysBetween, errorHandler, httpError, id, json as parseJson, notFound, parse, text, time, updates, weekdayOf } from './validate.js';

export const router = express.Router();
const json = parseJson();
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/* ---------- Routine ---------- */

const routineBody = z.object({
  title: text(120).min(1, 'add a title'),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1, 'pick at least one day').max(7)
    .transform((d) => [...new Set(d)].sort()),
  start: time.nullable().default(null),
  end: time.nullable().default(null),
  entityId: z.number().int().positive().nullable().default(null),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'pick a colour').default('#2e6a57'),
  note: text(500).default(''),
  startDate: date.default(null),
  endDate: date.default(null),
  active: z.boolean().default(true),
  // Weekdays with their own time, e.g. { "5": { start: "15:00", end: "16:00" } }: Fridays 3–4 pm.
  dayTimes: z.record(z.string().regex(/^[0-6]$/, 'weekday 0–6'), z.object({ start: time, end: time.nullable().default(null) }))
    .default({}),
});

function checkRoutine(b) {
  if (b.end && !b.start) throw httpError(400, 'start: add a start time before an end time');
  if (b.start && b.end && b.end <= b.start) throw httpError(400, 'end: must be after the start time');
  if (b.startDate && b.endDate && b.endDate < b.startDate) throw httpError(400, 'endDate: must be on or after the start date');
  for (const [d, t] of Object.entries(b.dayTimes || {})) {
    if (t.end && t.end <= t.start) throw httpError(400, `dayTimes: on ${WEEKDAY_NAMES[d]} the end must be after the start`);
  }
}
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Keeps only the day times for days the routine runs on, ready for the JSONB column. */
const dayTimesFor = (dayTimes, weekdays) => JSON.stringify(Object.fromEntries(Object.entries(dayTimes || {}).filter(([d]) => weekdays.includes(Number(d)))));

const ROUTINE_SELECT = `SELECT r.*, e.title AS entity_title, e.category AS entity_category
  FROM wolf.routines r LEFT JOIN wolf.entities e ON e.id = r.entity_id`;

const routineOut = (r) => ({
  id: r.id,
  title: r.title,
  weekdays: r.weekdays,
  start: r.start_time,
  end: r.end_time,
  entityId: r.entity_id,
  entityTitle: r.entity_title || null,
  entityCategory: r.entity_category || null,
  color: r.color,
  note: r.note,
  startDate: r.start_date,
  endDate: r.end_date,
  active: r.active,
  dayTimes: r.day_times || {},
});

const ROUTINE_COLUMNS = {
  title: 'title', weekdays: 'weekdays', start: 'start_time', end: 'end_time', entityId: 'entity_id',
  color: 'color', note: 'note', startDate: 'start_date', endDate: 'end_date', active: 'active', dayTimes: 'day_times',
};

async function checkEntity(entityId) {
  if (!entityId) return;
  const { rows } = await query('SELECT 1 FROM wolf.entities WHERE id = $1', [entityId]);
  if (!rows[0]) throw httpError(400, 'entityId: that entry does not exist');
}

router.get('/routines', async (req, res) => {
  const { rows } = await query(`${ROUTINE_SELECT} ORDER BY r.active DESC, r.start_time NULLS LAST, r.title`);
  res.json(rows.map(routineOut));
});

router.post('/routines', json, async (req, res) => {
  const b = parse(routineBody, req.body);
  checkRoutine(b);
  await checkEntity(b.entityId);
  b.dayTimes = dayTimesFor(b.dayTimes, b.weekdays);
  const cols = Object.values(ROUTINE_COLUMNS);
  const { rows } = await query(
    `INSERT INTO wolf.routines (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    Object.keys(ROUTINE_COLUMNS).map((k) => b[k]));
  const full = await query(`${ROUTINE_SELECT} WHERE r.id = $1`, [rows[0].id]);
  res.status(201).json(routineOut(full.rows[0]));
});

router.patch('/routines/:id', json, async (req, res) => {
  const rid = id(req.params.id);
  const b = parse(routineBody.partial(), req.body);
  const cur = await query(`${ROUTINE_SELECT} WHERE r.id = $1`, [rid]);
  if (!cur.rows[0]) throw notFound('Routine');
  const merged = { ...routineOut(cur.rows[0]), ...Object.fromEntries(Object.keys(req.body || {}).filter((k) => k in b).map((k) => [k, b[k]])) };
  checkRoutine(merged);
  if ('entityId' in req.body) await checkEntity(b.entityId);
  // Changing the days drops the times of days no longer in the routine.
  if ('dayTimes' in req.body || 'weekdays' in req.body) {
    req.body.dayTimes = true;
    b.dayTimes = dayTimesFor(merged.dayTimes, merged.weekdays);
  }
  const { sets, vals } = updates(req.body, b, ROUTINE_COLUMNS);
  vals.push(rid);
  await query(`UPDATE wolf.routines SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  const full = await query(`${ROUTINE_SELECT} WHERE r.id = $1`, [rid]);
  res.json(routineOut(full.rows[0]));
});

router.delete('/routines/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM wolf.routines WHERE id = $1', [id(req.params.id)]);
  if (!rowCount) throw notFound('Routine');
  res.status(204).end();
});

// Tick a routine off for one day (or untick it).
router.put('/routines/:id/checks/:date', json, async (req, res) => {
  const rid = id(req.params.id);
  if (!isDate(req.params.date)) throw httpError(400, 'date: use YYYY-MM-DD');
  const done = req.body?.done !== false;
  await tx(async (db) => {
    const r = await db.query('SELECT 1 FROM wolf.routines WHERE id = $1', [rid]);
    if (!r.rows[0]) throw notFound('Routine');
    if (done) await db.query('INSERT INTO wolf.routine_checks (routine_id, date) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rid, req.params.date]);
    else await db.query('DELETE FROM wolf.routine_checks WHERE routine_id = $1 AND date = $2', [rid, req.params.date]);
  });
  res.json({ done });
});

// Change one date only: another time, or skip it. Deleting the change puts the usual time back.
router.put('/routines/:id/changes/:date', json, async (req, res) => {
  const rid = id(req.params.id);
  if (!isDate(req.params.date)) throw httpError(400, 'date: use YYYY-MM-DD');
  const b = parse(z.object({ start: time.nullable().default(null), end: time.nullable().default(null), skipped: z.boolean().default(false) }), req.body);
  if (!b.skipped) {
    if (!b.start) throw httpError(400, 'start: pick a start time for this day');
    if (b.end && b.end <= b.start) throw httpError(400, 'end: must be after the start time');
  }
  const r = await query('SELECT 1 FROM wolf.routines WHERE id = $1', [rid]);
  if (!r.rows[0]) throw notFound('Routine');
  await query(`INSERT INTO wolf.routine_changes (routine_id, date, start_time, end_time, skipped) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (routine_id, date) DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, skipped = EXCLUDED.skipped`,
  [rid, req.params.date, b.skipped ? null : b.start, b.skipped ? null : b.end, b.skipped]);
  res.json({ ...b, date: req.params.date });
});

router.delete('/routines/:id/changes/:date', async (req, res) => {
  if (!isDate(req.params.date)) throw httpError(400, 'date: use YYYY-MM-DD');
  await query('DELETE FROM wolf.routine_changes WHERE routine_id = $1 AND date = $2', [id(req.params.id), req.params.date]);
  res.status(204).end();
});

/* ---------- Meetings ---------- */

const meetingBody = z.object({
  title: text(160).min(1, 'add a title'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'pick a date'),
  start: time.nullable().default(null),
  end: time.nullable().default(null),
  location: text(200).default(''),
  link: z.union([z.literal(''), z.string().trim().max(2000).url('enter a full link starting with https://')
    .refine((u) => /^https?:\/\//i.test(u), 'use an http or https link')]).default(''),
  entityId: z.number().int().positive().nullable().default(null),
  notes: text(4000).default(''),
});
const MEETING_COLUMNS = {
  title: 'title', date: 'date', start: 'start_time', end: 'end_time', location: 'location', link: 'link', entityId: 'entity_id', notes: 'notes',
};
const MEETING_SELECT = `SELECT m.*, e.title AS entity_title, e.color, e.category
  FROM wolf.meetings m LEFT JOIN wolf.entities e ON e.id = m.entity_id`;
const MEETING_COLOR = '#6b4bb3';
const CONTEST_COLOR = '#b3417f';

const meetingOut = (r) => ({
  id: r.id, title: r.title, date: r.date, start: r.start_time, end: r.end_time, location: r.location, link: r.link,
  entityId: r.entity_id, entityTitle: r.entity_title || null, color: r.color || MEETING_COLOR, notes: r.notes,
});

function checkTimes(b) {
  if (b.end && !b.start) throw httpError(400, 'start: add a start time before an end time');
  if (b.start && b.end && b.end <= b.start) throw httpError(400, 'end: must be after the start time');
}

router.get('/meetings/:id', async (req, res) => {
  const { rows } = await query(`${MEETING_SELECT} WHERE m.id = $1`, [id(req.params.id)]);
  if (!rows[0]) throw notFound('Meeting');
  res.json(meetingOut(rows[0]));
});

router.post('/meetings', json, async (req, res) => {
  const b = parse(meetingBody, req.body);
  checkTimes(b);
  await checkEntity(b.entityId);
  const cols = Object.values(MEETING_COLUMNS);
  const { rows } = await query(
    `INSERT INTO wolf.meetings (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    Object.keys(MEETING_COLUMNS).map((k) => b[k]));
  const full = await query(`${MEETING_SELECT} WHERE m.id = $1`, [rows[0].id]);
  res.status(201).json(meetingOut(full.rows[0]));
});

router.patch('/meetings/:id', json, async (req, res) => {
  const mid = id(req.params.id);
  const b = parse(meetingBody.partial(), req.body);
  const cur = await query(`${MEETING_SELECT} WHERE m.id = $1`, [mid]);
  if (!cur.rows[0]) throw notFound('Meeting');
  checkTimes({ ...meetingOut(cur.rows[0]), ...Object.fromEntries(Object.keys(req.body).filter((k) => k in b).map((k) => [k, b[k]])) });
  if ('entityId' in req.body) await checkEntity(b.entityId);
  const { sets, vals } = updates(req.body, b, MEETING_COLUMNS);
  vals.push(mid);
  await query(`UPDATE wolf.meetings SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  const full = await query(`${MEETING_SELECT} WHERE m.id = $1`, [mid]);
  res.json(meetingOut(full.rows[0]));
});

router.delete('/meetings/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM wolf.meetings WHERE id = $1', [id(req.params.id)]);
  if (!rowCount) throw notFound('Meeting');
  res.status(204).end();
});

/* ---------- Calendar ---------- */

/**
 * Everything that happens between from and to (inclusive), one item per occurrence:
 * task and subtask due dates, entry deadlines, CTs, meetings, routine days and class/lab times.
 */
async function events(from, to, { skipped = false } = {}) {
  const [tasks, entities, cts, meetings, contests, routines, checks, slots, changes] = await Promise.all([
    query(`SELECT t.id, t.title, t.due_date, t.done, t.reps, t.reps_done, t.priority, t.parent_id, p.title AS parent_title,
             e.id AS entity_id, e.title AS entity_title, e.color, e.category
           FROM wolf.tasks t JOIN wolf.entities e ON e.id = t.entity_id
           LEFT JOIN wolf.tasks p ON p.id = t.parent_id
           WHERE t.due_date BETWEEN $1 AND $2 AND e.status <> 'archived'`, [from, to]),
    query(`SELECT id, title, due_date, color, category, status FROM wolf.entities
           WHERE due_date BETWEEN $1 AND $2 AND status <> 'archived'`, [from, to]),
    query(`SELECT c.id, c.title, c.date, c.time, c.marks, c.total, e.id AS entity_id, e.title AS entity_title, e.color
           FROM wolf.cts c JOIN wolf.entities e ON e.id = c.entity_id
           WHERE c.date BETWEEN $1 AND $2 AND e.status <> 'archived'`, [from, to]),
    query(`${MEETING_SELECT} WHERE m.date BETWEEN $1 AND $2`, [from, to]),
    query(`SELECT id, platform, name, url, date, start_time, duration_min, rank, new_rating FROM wolf.cp_contests WHERE date BETWEEN $1 AND $2`, [from, to]),
    query(`${ROUTINE_SELECT} WHERE r.active AND (r.start_date IS NULL OR r.start_date <= $2) AND (r.end_date IS NULL OR r.end_date >= $1)`, [from, to]),
    query(`SELECT routine_id, date FROM wolf.routine_checks WHERE date BETWEEN $1 AND $2`, [from, to]),
    query(`SELECT s.*, e.title AS entity_title, e.color FROM wolf.class_slots s JOIN wolf.entities e ON e.id = s.entity_id
           WHERE e.status = 'active'`),
    query(`SELECT routine_id, date, start_time, end_time, skipped FROM wolf.routine_changes WHERE date BETWEEN $1 AND $2`, [from, to]),
  ]);

  const out = [];
  for (const t of tasks.rows) {
    out.push({
      type: t.parent_id ? 'subtask' : 'task', id: t.id, date: t.due_date, title: t.title, done: t.done, reps: t.reps, repsDone: t.reps_done, priority: t.priority,
      parentTitle: t.parent_title, entityId: t.entity_id, entityTitle: t.entity_title, color: t.color, category: t.category,
    });
  }
  for (const e of entities.rows) {
    out.push({ type: 'deadline', id: e.id, date: e.due_date, title: e.title, done: e.status === 'done', entityId: e.id, entityTitle: e.title, color: e.color, category: e.category });
  }
  for (const c of cts.rows) {
    out.push({
      type: 'ct', id: c.id, date: c.date, time: c.time, title: c.title, done: c.marks !== null,
      marks: num(c.marks), total: num(c.total), entityId: c.entity_id, entityTitle: c.entity_title, color: c.color,
    });
  }
  for (const m of meetings.rows) {
    const o = meetingOut(m);
    out.push({
      type: 'meeting', id: o.id, date: o.date, time: o.start, endTime: o.end, title: o.title, location: o.location, link: o.link,
      entityId: o.entityId, entityTitle: o.entityTitle, color: o.color,
    });
  }
  for (const c of contests.rows) {
    out.push({
      type: 'contest', id: c.id, date: c.date, time: c.start_time, endTime: endOf(c.start_time, c.duration_min), title: c.name, link: c.url, platform: c.platform,
      done: c.rank !== null || c.new_rating !== null, color: CONTEST_COLOR,
    });
  }

  const checked = new Set(checks.rows.map((c) => `${c.routine_id}:${c.date}`));
  const changed = new Map(changes.rows.map((c) => [`${c.routine_id}:${c.date}`, c]));
  const n = daysBetween(from, to);
  for (let i = 0; i <= n; i++) {
    const d = addDays(from, i);
    const wd = weekdayOf(d);
    for (const r of routines.rows) {
      if (!r.weekdays.includes(wd) || (r.start_date && d < r.start_date) || (r.end_date && d > r.end_date)) continue;
      // This date's own change, else this weekday's time, else the routine's usual time.
      const usual = r.day_times?.[wd] || { start: r.start_time, end: r.end_time };
      const ch = changed.get(`${r.id}:${d}`);
      if (ch?.skipped && !skipped) continue;
      out.push({
        type: 'routine', id: r.id, date: d, time: ch && !ch.skipped ? ch.start_time : usual.start, endTime: ch && !ch.skipped ? ch.end_time : usual.end,
        usualTime: usual.start, usualEndTime: usual.end, changed: Boolean(ch), skipped: Boolean(ch?.skipped),
        title: r.title, done: checked.has(`${r.id}:${d}`), entityId: r.entity_id, entityTitle: r.entity_title, color: r.color,
      });
    }
    for (const s of slots.rows) {
      if (s.weekday !== wd) continue;
      out.push({
        type: s.kind, id: s.id, date: d, time: s.start_time, endTime: s.end_time, title: s.entity_title,
        location: s.location, entityId: s.entity_id, entityTitle: s.entity_title, color: s.color,
      });
    }
  }
  // Timed items first within a day, in time order; then the rest.
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || '99') < (b.time || '99') ? -1 : (a.time || '99') > (b.time || '99') ? 1 : 0));
}

/** '20:35' + 135 min -> '22:50'; a contest running past midnight ends at 23:59 on its day. */
function endOf(start, minutes) {
  if (!start || !minutes) return null;
  const [h, m] = start.split(':').map(Number);
  const t = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

router.get('/calendar', async (req, res) => {
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to) || to < from) throw httpError(400, 'Give from and to as YYYY-MM-DD');
  if (daysBetween(from, to) > 62) throw httpError(400, 'Ask for at most 62 days at a time');
  res.json(await events(from, to, { skipped: req.query.skipped === '1' }));
});

// The dashboard's "Today": what's on today, what's overdue and deadlines in the next week.
router.get('/agenda', async (req, res) => {
  const today = isDate(req.query.today) ? req.query.today : new Date().toISOString().slice(0, 10);
  const [list, overdue, reminders] = await Promise.all([
    events(today, addDays(today, 7)),
    query(`SELECT t.id, t.title, t.due_date, t.parent_id, p.title AS parent_title, e.id AS entity_id, e.title AS entity_title, e.color
           FROM wolf.tasks t JOIN wolf.entities e ON e.id = t.entity_id LEFT JOIN wolf.tasks p ON p.id = t.parent_id
           WHERE NOT t.done AND t.due_date < $1 AND e.status IN ('active', 'paused')
           ORDER BY t.due_date LIMIT 20`, [today]),
    // Reminders up to a week ahead; the browser decides which are due, since it knows the local time.
    query(`SELECT n.*, e.title AS entity_title, e.color, e.category FROM wolf.notes n JOIN wolf.entities e ON e.id = n.entity_id
           WHERE n.remind_at IS NOT NULL AND NOT n.done AND n.remind_at < now() + interval '8 days' AND e.status <> 'archived'
           ORDER BY n.remind_at LIMIT 50`),
  ]);
  res.json({
    today,
    todayItems: list.filter((e) => e.date === today),
    upcoming: list.filter((e) => e.date > today && ['task', 'subtask', 'deadline', 'ct', 'meeting', 'contest'].includes(e.type) && !e.done),
    reminders: reminders.rows.map(noteOut),
    overdue: overdue.rows.map((t) => ({
      type: t.parent_id ? 'subtask' : 'task', id: t.id, date: t.due_date, title: t.title, parentTitle: t.parent_title,
      entityId: t.entity_id, entityTitle: t.entity_title, color: t.color, done: false,
    })),
  });
});

router.use(errorHandler);
