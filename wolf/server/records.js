// Per-entry records: papers for research, class/lab times and CTs for academics.
import express from 'express';
import { z } from 'zod';
import { query } from './db.js';
import { date, errorHandler, httpError, id, json as parseJson, notFound, parse, text, time, updates } from './validate.js';

export const router = express.Router();
const json = parseJson();

const num = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * List/create under /entities/:id/<path>, update/delete under /<path>/:id.
 * category limits which kind of entry the records can belong to.
 */
function records({ path, table, category, schema, columns, out, order, refine }) {
  const cols = Object.values(columns);

  async function checkEntity(eid) {
    const { rows } = await query('SELECT category FROM wolf.entities WHERE id = $1', [eid]);
    if (!rows[0]) throw notFound('Entry');
    if (rows[0].category !== category) throw httpError(400, `Only ${category} entries have ${path}`);
  }

  router.get(`/entities/:id/${path}`, async (req, res) => {
    const eid = id(req.params.id);
    await checkEntity(eid);
    const { rows } = await query(`SELECT * FROM wolf.${table} WHERE entity_id = $1 ORDER BY ${order}`, [eid]);
    res.json(rows.map(out));
  });

  router.post(`/entities/:id/${path}`, json, async (req, res) => {
    const eid = id(req.params.id);
    const b = parse(schema, req.body);
    refine?.(b);
    await checkEntity(eid);
    const vals = Object.keys(columns).map((k) => b[k]);
    const { rows } = await query(
      `INSERT INTO wolf.${table} (entity_id, ${cols.join(', ')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING *`,
      [eid, ...vals]);
    await query('UPDATE wolf.entities SET updated_at = now() WHERE id = $1', [eid]);
    res.status(201).json(out(rows[0]));
  });

  router.patch(`/${path}/:id`, json, async (req, res) => {
    const rid = id(req.params.id);
    const partial = schema.partial();
    const b = parse(partial, req.body);
    if (refine) {
      // Check cross-field rules (like end after start) against the stored row merged with the change.
      const cur = await query(`SELECT * FROM wolf.${table} WHERE id = $1`, [rid]);
      if (!cur.rows[0]) throw notFound();
      refine({ ...out(cur.rows[0]), ...Object.fromEntries(Object.keys(b).filter((k) => k in req.body).map((k) => [k, b[k]])) });
    }
    const { sets, vals } = updates(req.body, b, columns);
    vals.push(rid);
    const { rows } = await query(`UPDATE wolf.${table} SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    if (!rows[0]) throw notFound();
    res.json(out(rows[0]));
  });

  router.delete(`/${path}/:id`, async (req, res) => {
    const { rowCount } = await query(`DELETE FROM wolf.${table} WHERE id = $1`, [id(req.params.id)]);
    if (!rowCount) throw notFound();
    res.status(204).end();
  });
}

/* ---------- Papers (research) ---------- */

records({
  path: 'papers',
  table: 'papers',
  category: 'research',
  schema: z.object({
    title: text(300).min(1, 'add a title'),
    url: z.union([z.literal(''), z.string().trim().max(2000).url('enter a full link starting with https://')
      .refine((u) => /^https?:\/\//i.test(u), 'use an http or https link')]).default(''),
    authors: text(300).default(''),
    year: z.number().int().min(1800).max(2100).nullable().default(null),
    venue: text(200).default(''),
    status: z.enum(['to_read', 'reading', 'read']).default('to_read'),
    notes: text(10000).default(''),
  }),
  columns: { title: 'title', url: 'url', authors: 'authors', year: 'year', venue: 'venue', status: 'status', notes: 'notes' },
  order: "CASE status WHEN 'reading' THEN 0 WHEN 'to_read' THEN 1 ELSE 2 END, id DESC",
  out: (r) => ({ id: r.id, entityId: r.entity_id, title: r.title, url: r.url, authors: r.authors, year: r.year, venue: r.venue, status: r.status, notes: r.notes, createdAt: r.created_at }),
});

/* ---------- Class and lab times (academic) ---------- */

records({
  path: 'slots',
  table: 'class_slots',
  category: 'academic',
  schema: z.object({
    kind: z.enum(['class', 'lab']).default('class'),
    weekday: z.number().int().min(0).max(6),
    start: time,
    end: time,
    location: text(120).default(''),
    note: text(200).default(''),
  }),
  columns: { kind: 'kind', weekday: 'weekday', start: 'start_time', end: 'end_time', location: 'location', note: 'note' },
  refine: (b) => { if (b.start && b.end && b.end <= b.start) throw httpError(400, 'end: must be after the start time'); },
  order: 'weekday, start_time',
  out: (r) => ({ id: r.id, entityId: r.entity_id, kind: r.kind, weekday: r.weekday, start: r.start_time, end: r.end_time, location: r.location, note: r.note }),
});

/* ---------- Class tests (academic) ---------- */

records({
  path: 'cts',
  table: 'cts',
  category: 'academic',
  schema: z.object({
    title: text(80).min(1, 'add a name, e.g. CT 1'),
    date: date.default(null),
    time: time.nullable().default(null),
    syllabus: text(2000).default(''),
    marks: z.number().min(0).max(9999).nullable().default(null),
    total: z.number().positive('must be more than 0').max(9999).default(20),
  }),
  columns: { title: 'title', date: 'date', time: 'time', syllabus: 'syllabus', marks: 'marks', total: 'total' },
  refine: (b) => { if (b.marks != null && b.total != null && b.marks > b.total) throw httpError(400, 'marks: cannot be more than the total'); },
  order: 'date NULLS LAST, id',
  out: (r) => ({ id: r.id, entityId: r.entity_id, title: r.title, date: r.date, time: r.time, syllabus: r.syllabus, marks: num(r.marks), total: num(r.total) }),
});

router.use(errorHandler);
