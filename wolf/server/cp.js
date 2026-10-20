// Competitive programming: a problem log (with an upsolve queue), contests and ratings, topics to learn,
// practice stats, and Codeforces import plus its upcoming contests.
import express from 'express';
import { z } from 'zod';
import { query, tx } from './db.js';
import { addDays, date, errorHandler, httpError, id, json as parseJson, notFound, parse, text, time, updates } from './validate.js';

export const router = express.Router();
const json = parseJson();

export const PLATFORMS = ['codeforces', 'atcoder', 'leetcode', 'codechef', 'cses', 'other'];
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const link = z.union([z.literal(''), z.string().trim().max(2000).url('enter a full link starting with https://')
  .refine((u) => /^https?:\/\//i.test(u), 'use an http or https link')]).default('');
const tagList = z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([])
  .transform((t) => [...new Set(t)]);

/* ---------- Settings ---------- */

const SETTINGS = { cfHandle: '', dailyGoal: 2, lastSync: null };

async function getSettings() {
  const { rows } = await query("SELECT value FROM wolf.settings WHERE key = 'cp'");
  return { ...SETTINGS, ...rows[0]?.value };
}
async function saveSettings(patch) {
  const next = { ...await getSettings(), ...patch };
  await query(`INSERT INTO wolf.settings (key, value) VALUES ('cp', $1)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(next)]);
  return next;
}

router.get('/cp/settings', async (req, res) => res.json(await getSettings()));

router.put('/cp/settings', json, async (req, res) => {
  const b = parse(z.object({
    cfHandle: z.string().trim().regex(/^[\w.-]{0,24}$/, 'use your Codeforces handle, e.g. tourist').optional(),
    dailyGoal: z.number().int().min(0).max(50).optional(),
  }), req.body);
  res.json(await saveSettings(b));
});

/* ---------- Problems ---------- */

const problemBody = z.object({
  platform: z.enum(PLATFORMS).default('other'),
  code: z.string().trim().max(40).nullable().default(null).transform((v) => v || null),
  title: text(200).min(1, 'add the problem name'),
  url: link,
  rating: z.number().int().min(0).max(5000).nullable().default(null),
  tags: tagList,
  status: z.enum(['solved', 'upsolve', 'attempted', 'todo']).default('solved'),
  solvedOn: date.default(null),
  timeMin: z.number().int().min(0).max(10000).nullable().default(null),
  withHelp: z.boolean().default(false),
  notes: text(10000).default(''),
  contestId: z.number().int().positive().nullable().default(null),
});
const PROBLEM_COLUMNS = {
  platform: 'platform', code: 'code', title: 'title', url: 'url', rating: 'rating', tags: 'tags', status: 'status',
  solvedOn: 'solved_on', timeMin: 'time_min', withHelp: 'with_help', notes: 'notes', contestId: 'contest_id',
};

const problemOut = (r) => ({
  id: r.id, platform: r.platform, code: r.code, title: r.title, url: r.url, rating: r.rating, tags: r.tags, status: r.status,
  solvedOn: r.solved_on, timeMin: r.time_min, withHelp: r.with_help, notes: r.notes, contestId: r.contest_id,
  contestName: r.contest_name ?? null, source: r.source, createdAt: r.created_at,
});

const PROBLEM_SELECT = `SELECT p.*, c.name AS contest_name FROM wolf.cp_problems p LEFT JOIN wolf.cp_contests c ON c.id = p.contest_id`;

// A duplicate problem (same platform and code) gets a readable message instead of a 500.
async function saving(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.code === '23505') throw httpError(409, 'code: that problem is already in your log');
    if (err.code === '23503') throw httpError(400, 'contestId: that contest does not exist');
    throw err;
  }
}

router.get('/cp/problems', async (req, res) => {
  const where = [];
  const vals = [];
  const add = (sql, v) => { vals.push(v); where.push(sql.replace('?', `$${vals.length}`)); };
  if (['solved', 'upsolve', 'attempted', 'todo'].includes(req.query.status)) add('p.status = ?', req.query.status);
  if (PLATFORMS.includes(req.query.platform)) add('p.platform = ?', req.query.platform);
  if (req.query.tag) add('? = ANY (p.tags)', String(req.query.tag).slice(0, 40));
  if (req.query.q) {
    vals.push(`%${String(req.query.q).slice(0, 80)}%`);
    where.push(`(p.title ILIKE $${vals.length} OR p.code ILIKE $${vals.length})`);
  }
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const cond = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [list, count] = await Promise.all([
    query(`${PROBLEM_SELECT} ${cond} ORDER BY COALESCE(p.solved_on, p.created_at::date) DESC, p.id DESC LIMIT ${limit} OFFSET ${offset}`, vals),
    query(`SELECT COUNT(*)::int AS n FROM wolf.cp_problems p ${cond}`, vals),
  ]);
  res.json({ items: list.rows.map(problemOut), total: count.rows[0].n });
});

router.post('/cp/problems', json, async (req, res) => {
  const b = parse(problemBody, req.body);
  if (b.status === 'solved' && !b.solvedOn) b.solvedOn = isDate(req.query.today) ? req.query.today : new Date().toISOString().slice(0, 10);
  const cols = Object.values(PROBLEM_COLUMNS);
  const { rows } = await saving(() => query(
    `INSERT INTO wolf.cp_problems (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    Object.keys(PROBLEM_COLUMNS).map((k) => b[k])));
  const full = await query(`${PROBLEM_SELECT} WHERE p.id = $1`, [rows[0].id]);
  res.status(201).json(problemOut(full.rows[0]));
});

router.patch('/cp/problems/:id', json, async (req, res) => {
  const pid = id(req.params.id);
  const b = parse(problemBody.partial(), req.body);
  const { sets, vals } = updates(req.body, b, PROBLEM_COLUMNS);
  vals.push(pid);
  const { rowCount } = await saving(() => query(`UPDATE wolf.cp_problems SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals));
  if (!rowCount) throw notFound('Problem');
  const full = await query(`${PROBLEM_SELECT} WHERE p.id = $1`, [pid]);
  res.json(problemOut(full.rows[0]));
});

router.delete('/cp/problems/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM wolf.cp_problems WHERE id = $1', [id(req.params.id)]);
  if (!rowCount) throw notFound('Problem');
  res.status(204).end();
});

/* ---------- Contests ---------- */

const contestBody = z.object({
  platform: z.enum(PLATFORMS).default('other'),
  name: text(200).min(1, 'add the contest name'),
  url: link,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'pick a date'),
  start: time.nullable().default(null),
  durationMin: z.number().int().min(1).max(100000).nullable().default(null),
  rank: z.number().int().min(1).nullable().default(null),
  oldRating: z.number().int().min(-1000).max(5000).nullable().default(null),
  newRating: z.number().int().min(-1000).max(5000).nullable().default(null),
  solved: z.number().int().min(0).max(100).nullable().default(null),
  total: z.number().int().min(0).max(100).nullable().default(null),
  notes: text(10000).default(''),
  extId: z.string().trim().max(40).nullable().default(null),
});
const CONTEST_COLUMNS = {
  platform: 'platform', name: 'name', url: 'url', date: 'date', start: 'start_time', durationMin: 'duration_min', rank: 'rank',
  oldRating: 'old_rating', newRating: 'new_rating', solved: 'solved', total: 'total', notes: 'notes', extId: 'ext_id',
};

const contestOut = (r) => ({
  id: r.id, platform: r.platform, name: r.name, url: r.url, date: r.date, start: r.start_time, durationMin: r.duration_min,
  rank: r.rank, oldRating: r.old_rating, newRating: r.new_rating, solved: r.solved, total: r.total, notes: r.notes, extId: r.ext_id,
  upsolve: r.upsolve ?? 0,
});

router.get('/cp/contests', async (req, res) => {
  const { rows } = await query(`SELECT c.*, (SELECT COUNT(*)::int FROM wolf.cp_problems p WHERE p.contest_id = c.id AND p.status = 'upsolve') AS upsolve
    FROM wolf.cp_contests c ORDER BY c.date DESC, c.start_time DESC NULLS LAST, c.id DESC LIMIT 500`);
  res.json(rows.map(contestOut));
});

router.post('/cp/contests', json, async (req, res) => {
  const b = parse(contestBody, req.body);
  const cols = Object.values(CONTEST_COLUMNS);
  const { rows } = await query(
    `INSERT INTO wolf.cp_contests (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT (platform, ext_id) WHERE ext_id IS NOT NULL DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    Object.keys(CONTEST_COLUMNS).map((k) => b[k]));
  res.status(201).json(contestOut(rows[0]));
});

router.patch('/cp/contests/:id', json, async (req, res) => {
  const b = parse(contestBody.partial(), req.body);
  const { sets, vals } = updates(req.body, b, CONTEST_COLUMNS);
  vals.push(id(req.params.id));
  const { rows } = await query(`UPDATE wolf.cp_contests SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
  if (!rows[0]) throw notFound('Contest');
  res.json(contestOut(rows[0]));
});

router.delete('/cp/contests/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM wolf.cp_contests WHERE id = $1', [id(req.params.id)]);
  if (!rowCount) throw notFound('Contest');
  res.status(204).end();
});

/* ---------- Topics ---------- */

const topicBody = z.object({
  name: text(120).min(1, 'add a topic'),
  tag: z.string().trim().toLowerCase().max(40).default(''),
  status: z.enum(['todo', 'learning', 'done']).default('todo'),
  links: z.array(z.string().trim().max(2000).url('each link must be a full https:// address')
    .refine((u) => /^https?:\/\//i.test(u), 'use http or https links')).max(20).default([]),
  notes: text(10000).default(''),
});
const TOPIC_COLUMNS = { name: 'name', tag: 'tag', status: 'status', links: 'links', notes: 'notes' };

// solved counts how many solved problems carry the topic's tag, so practice shows next to learning.
const TOPIC_SELECT = `SELECT t.*, (SELECT COUNT(*)::int FROM wolf.cp_problems p WHERE t.tag <> '' AND p.status = 'solved' AND t.tag = ANY (p.tags)) AS solved
  FROM wolf.cp_topics t`;
const topicOut = (r) => ({ id: r.id, name: r.name, tag: r.tag, status: r.status, links: r.links, notes: r.notes, position: r.position, solved: r.solved });

router.get('/cp/topics', async (req, res) => {
  const { rows } = await query(`${TOPIC_SELECT} ORDER BY t.position, t.id`);
  res.json(rows.map(topicOut));
});

router.post('/cp/topics', json, async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : [req.body];
  if (list.length > 100) throw httpError(400, 'Add at most 100 topics at a time');
  const parsed = list.map((t) => parse(topicBody, t));
  const ids = await tx(async (db) => {
    const out = [];
    for (const b of parsed) {
      const { rows } = await db.query(
        `INSERT INTO wolf.cp_topics (name, tag, status, links, notes, position)
         VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(position), 0) + 1 FROM wolf.cp_topics)) RETURNING id`,
        [b.name, b.tag, b.status, b.links, b.notes]);
      out.push(rows[0].id);
    }
    return out;
  });
  const { rows } = await query(`${TOPIC_SELECT} WHERE t.id = ANY ($1) ORDER BY t.position`, [ids]);
  res.status(201).json(Array.isArray(req.body) ? rows.map(topicOut) : topicOut(rows[0]));
});

router.patch('/cp/topics/:id', json, async (req, res) => {
  const tid = id(req.params.id);
  const b = parse(topicBody.partial(), req.body);
  const { sets, vals } = updates(req.body, b, TOPIC_COLUMNS);
  vals.push(tid);
  const { rowCount } = await query(`UPDATE wolf.cp_topics SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
  if (!rowCount) throw notFound('Topic');
  const { rows } = await query(`${TOPIC_SELECT} WHERE t.id = $1`, [tid]);
  res.json(topicOut(rows[0]));
});

router.delete('/cp/topics/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM wolf.cp_topics WHERE id = $1', [id(req.params.id)]);
  if (!rowCount) throw notFound('Topic');
  res.status(204).end();
});

/* ---------- Stats ---------- */

/** Longest run of consecutive dates in a sorted list of 'YYYY-MM-DD'. */
function bestRun(dates) {
  let best = 0;
  let run = 0;
  for (let i = 0; i < dates.length; i++) {
    run = i && addDays(dates[i - 1], 1) === dates[i] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

router.get('/cp/summary', async (req, res) => {
  const today = isDate(req.query.today) ? req.query.today : new Date().toISOString().slice(0, 10);
  const from = addDays(today, -370);
  const [counts, days, allDays, tags, ratings, platforms, history, settings, allTags] = await Promise.all([
    query(`SELECT status, COUNT(*)::int AS n FROM wolf.cp_problems GROUP BY status`),
    query(`SELECT solved_on AS d, COUNT(*)::int AS n FROM wolf.cp_problems WHERE status = 'solved' AND solved_on BETWEEN $1 AND $2 GROUP BY solved_on`, [from, today]),
    query(`SELECT DISTINCT solved_on AS d FROM wolf.cp_problems WHERE status = 'solved' AND solved_on IS NOT NULL ORDER BY 1`),
    query(`SELECT tag, COUNT(*)::int AS n FROM wolf.cp_problems, unnest(tags) AS tag WHERE status = 'solved' GROUP BY tag ORDER BY n DESC, tag LIMIT 12`),
    query(`SELECT (rating / 100) * 100 AS r, COUNT(*)::int AS n FROM wolf.cp_problems WHERE status = 'solved' AND rating IS NOT NULL GROUP BY 1 ORDER BY 1`),
    query(`SELECT platform, COUNT(*)::int AS n FROM wolf.cp_problems WHERE status = 'solved' GROUP BY platform ORDER BY n DESC`),
    query(`SELECT platform, date, name, new_rating, old_rating, rank FROM wolf.cp_contests WHERE new_rating IS NOT NULL ORDER BY date, id`),
    getSettings(),
    query(`SELECT DISTINCT unnest(tags) AS tag FROM wolf.cp_problems ORDER BY 1`),
  ]);

  const byDay = Object.fromEntries(days.rows.map((r) => [r.d, r.n]));
  // A streak stays alive until the end of today, so count back from yesterday if nothing is solved yet today.
  let streak = 0;
  for (let d = byDay[today] ? today : addDays(today, -1); byDay[d]; d = addDays(d, -1)) streak++;
  const status = Object.fromEntries(counts.rows.map((r) => [r.status, r.n]));
  const week = Array.from({ length: 7 }, (_, i) => byDay[addDays(today, -i)] || 0).reduce((a, b) => a + b, 0);

  // Latest rating per platform, and the best reached.
  const current = {};
  for (const h of history.rows) {
    const c = (current[h.platform] ||= { platform: h.platform, rating: null, max: -Infinity, contests: 0 });
    c.rating = h.new_rating;
    c.max = Math.max(c.max, h.new_rating);
    c.contests++;
  }

  res.json({
    today,
    solved: status.solved || 0,
    upsolve: status.upsolve || 0,
    attempted: status.attempted || 0,
    todo: status.todo || 0,
    solvedToday: byDay[today] || 0,
    week,
    streak,
    bestStreak: bestRun(allDays.rows.map((r) => r.d)),
    goal: settings.dailyGoal,
    days: byDay,
    tags: tags.rows.map((r) => ({ tag: r.tag, count: r.n })),
    ratings: ratings.rows.map((r) => ({ rating: r.r, count: r.n })),
    platforms: platforms.rows.map((r) => ({ platform: r.platform, count: r.n })),
    history: history.rows.map((r) => ({ platform: r.platform, date: r.date, name: r.name, rating: r.new_rating, change: r.old_rating != null ? r.new_rating - r.old_rating : null, rank: r.rank })),
    current: Object.values(current),
    allTags: allTags.rows.map((r) => r.tag),
  });
});

/* ---------- Codeforces ---------- */

const CF = 'https://codeforces.com/api';

async function cf(method, params = {}) {
  const url = `${CF}/${method}?${new URLSearchParams(params)}`;
  let body;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Wolf (personal tracker)' } });
    body = await r.json();
  } catch {
    throw httpError(502, 'Could not reach Codeforces. Try again in a minute.');
  }
  if (body.status !== 'OK') {
    if (/not found/i.test(body.comment || '')) throw httpError(400, 'cfHandle: Codeforces has no user with that handle');
    throw httpError(502, `Codeforces said: ${body.comment || 'something went wrong'}`);
  }
  return body.result;
}

// The contest list is big and rarely changes; keep it for 30 minutes.
let contestCache = { at: 0, list: [] };
async function cfContests() {
  if (Date.now() - contestCache.at < 30 * 60_000 && contestCache.list.length) return contestCache.list;
  const list = await cf('contest.list', { gym: 'false' });
  contestCache = { at: Date.now(), list };
  return list;
}

/** Unix seconds -> local { date, time } for a browser tz offset in minutes east of UTC. */
const local = (sec, tz) => {
  const iso = new Date((sec + tz * 60) * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
};

const IN_CONTEST = new Set(['CONTESTANT', 'OUT_OF_COMPETITION', 'VIRTUAL']);

// Imports the handle's submissions and rating history. Solved problems join the log; problems tried in a
// contest but not solved go to the upsolve queue. Nothing already in the log is downgraded.
router.post('/cp/sync/codeforces', json, async (req, res) => {
  const tz = Number.isInteger(req.body.tz) && Math.abs(req.body.tz) <= 14 * 60 ? req.body.tz : 0;
  const { cfHandle } = await getSettings();
  if (!cfHandle) throw httpError(400, 'cfHandle: add your Codeforces handle first');

  const [subs, rating, contests] = await Promise.all([
    cf('user.status', { handle: cfHandle }),
    cf('user.rating', { handle: cfHandle }),
    cfContests().catch(() => []),
  ]);
  const contestById = new Map(contests.map((c) => [c.id, c]));

  const problems = new Map();
  const solvedInContest = new Map(); // contestId -> Set of indexes solved while taking part
  for (const s of subs) {
    const p = s.problem;
    if (!p.contestId || p.contestId >= 100000) continue; // skip gym
    const code = `${p.contestId}${p.index}`;
    const cur = problems.get(code) || {
      code, title: `${p.index}. ${p.name}`, rating: p.rating ?? null, tags: p.tags || [],
      url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`, ok: null, inContest: false,
    };
    if (s.verdict === 'OK') {
      cur.ok = cur.ok === null ? s.creationTimeSeconds : Math.min(cur.ok, s.creationTimeSeconds);
      if (s.author?.participantType === 'CONTESTANT') {
        if (!solvedInContest.has(p.contestId)) solvedInContest.set(p.contestId, new Set());
        solvedInContest.get(p.contestId).add(p.index);
      }
    }
    if (IN_CONTEST.has(s.author?.participantType)) cur.inContest = true;
    problems.set(code, cur);
  }

  const rows = [...problems.values()].map((p) => ({
    code: p.code, title: p.title.slice(0, 200), url: p.url, rating: p.rating, tags: p.tags.map((t) => t.toLowerCase()).slice(0, 20),
    status: p.ok !== null ? 'solved' : p.inContest ? 'upsolve' : 'attempted',
    solved_on: p.ok !== null ? local(p.ok, tz).date : null,
  }));

  const contestRows = rating.map((r) => {
    const c = contestById.get(r.contestId);
    const when = local(c?.startTimeSeconds ?? r.ratingUpdateTimeSeconds, tz);
    return {
      ext_id: String(r.contestId), name: r.contestName.slice(0, 200), url: `https://codeforces.com/contest/${r.contestId}`,
      date: when.date, start: c?.startTimeSeconds ? when.time : null, duration: c?.durationSeconds ? Math.round(c.durationSeconds / 60) : null,
      rank: r.rank, old_rating: r.oldRating, new_rating: r.newRating, solved: solvedInContest.get(r.contestId)?.size ?? null,
    };
  });

  const result = await tx(async (db) => {
    const before = await db.query(`SELECT COUNT(*) FILTER (WHERE status = 'solved')::int AS solved, COUNT(*)::int AS total FROM wolf.cp_problems`);
    await db.query(`
      INSERT INTO wolf.cp_problems (platform, code, title, url, rating, tags, status, solved_on, source)
      SELECT 'codeforces', x.code, x.title, x.url, x.rating, ARRAY(SELECT jsonb_array_elements_text(x.tags)), x.status, x.solved_on, 'codeforces'
      FROM jsonb_to_recordset($1::jsonb) AS x(code text, title text, url text, rating int, tags jsonb, status text, solved_on date)
      ON CONFLICT (platform, code) WHERE code IS NOT NULL DO UPDATE SET
        status = CASE WHEN EXCLUDED.status = 'solved' THEN 'solved'
                      WHEN wolf.cp_problems.status = 'attempted' AND EXCLUDED.status = 'upsolve' THEN 'upsolve'
                      ELSE wolf.cp_problems.status END,
        solved_on = COALESCE(wolf.cp_problems.solved_on, EXCLUDED.solved_on),
        rating = COALESCE(wolf.cp_problems.rating, EXCLUDED.rating),
        tags = CASE WHEN cardinality(wolf.cp_problems.tags) = 0 THEN EXCLUDED.tags ELSE wolf.cp_problems.tags END,
        url = CASE WHEN wolf.cp_problems.url = '' THEN EXCLUDED.url ELSE wolf.cp_problems.url END`,
    [JSON.stringify(rows)]);
    const contestsBefore = await db.query(`SELECT COUNT(*)::int AS n FROM wolf.cp_contests WHERE platform = 'codeforces' AND new_rating IS NOT NULL`);
    await db.query(`
      INSERT INTO wolf.cp_contests (platform, ext_id, name, url, date, start_time, duration_min, rank, old_rating, new_rating, solved)
      SELECT 'codeforces', x.ext_id, x.name, x.url, x.date, x.start, x.duration, x.rank, x.old_rating, x.new_rating, x.solved
      FROM jsonb_to_recordset($1::jsonb) AS x(ext_id text, name text, url text, date date, start text, duration int, rank int, old_rating int, new_rating int, solved int)
      ON CONFLICT (platform, ext_id) WHERE ext_id IS NOT NULL DO UPDATE SET
        rank = EXCLUDED.rank, old_rating = EXCLUDED.old_rating, new_rating = EXCLUDED.new_rating,
        solved = COALESCE(EXCLUDED.solved, wolf.cp_contests.solved)`,
    [JSON.stringify(contestRows)]);
    // Tie problems to the contest they belong to (1850C belongs to contest 1850).
    await db.query(`UPDATE wolf.cp_problems p SET contest_id = c.id FROM wolf.cp_contests c
      WHERE p.platform = 'codeforces' AND c.platform = 'codeforces' AND p.contest_id IS NULL AND c.ext_id IS NOT NULL
        AND p.code ~ ('^' || c.ext_id || '[A-Z]')`);
    const after = await db.query(`SELECT COUNT(*) FILTER (WHERE status = 'solved')::int AS solved, COUNT(*)::int AS total FROM wolf.cp_problems`);
    const contestsAfter = await db.query(`SELECT COUNT(*)::int AS n FROM wolf.cp_contests WHERE platform = 'codeforces' AND new_rating IS NOT NULL`);
    return {
      newSolved: after.rows[0].solved - before.rows[0].solved,
      newProblems: after.rows[0].total - before.rows[0].total,
      newContests: contestsAfter.rows[0].n - contestsBefore.rows[0].n,
    };
  });
  const settings = await saveSettings({ lastSync: new Date().toISOString() });
  res.json({ ...result, lastSync: settings.lastSync, handle: cfHandle });
});

// Codeforces contests that have not started yet, marked if already planned.
router.get('/cp/upcoming', async (req, res) => {
  const list = (await cfContests()).filter((c) => c.phase === 'BEFORE').sort((a, b) => a.startTimeSeconds - b.startTimeSeconds).slice(0, 30);
  const planned = await query(`SELECT ext_id FROM wolf.cp_contests WHERE platform = 'codeforces' AND ext_id = ANY ($1)`, [list.map((c) => String(c.id))]);
  const have = new Set(planned.rows.map((r) => r.ext_id));
  res.json(list.map((c) => ({
    platform: 'codeforces', extId: String(c.id), name: c.name, url: `https://codeforces.com/contests/${c.id}`,
    start: new Date(c.startTimeSeconds * 1000).toISOString(), durationMin: Math.round(c.durationSeconds / 60), planned: have.has(String(c.id)),
  })));
});

router.use(errorHandler);
