// Wolf's own workspace: projects, research and academics, each with an optional step line, tasks and subtasks.
import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { config } from './config.js';
import { query, tx } from './db.js';
import { date, errorHandler, httpError, id, json, notFound, parse, text } from './validate.js';

export const router = express.Router();

export const CATEGORIES = ['project', 'research', 'academic'];

const stepList = z.array(z.object({
  id: z.string().regex(/^[\w-]{1,40}$/).optional(),
  name: text(80).min(1, 'give every step a name'),
})).max(20, 'at most 20 steps');

const entityBody = z.object({
  category: z.enum(CATEGORIES),
  title: text(120).min(1, 'add a title'),
  description: text(4000).default(''),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'pick a colour').default('#2e6a57'),
  status: z.enum(['active', 'paused', 'done', 'archived']).default('active'),
  dueDate: date.default(null),
  steps: stepList.default([]),
  stepIndex: z.number().int().min(0).default(0),
});

const taskBody = z.object({
  title: text(300).min(1, 'add a title'),
  notes: text(10000).default(''),
  done: z.boolean().default(false),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  dueDate: date.default(null),
  stepId: z.string().max(40).nullable().default(null),
  parentId: z.number().int().positive().nullable().default(null),
  fileId: z.number().int().positive().nullable().default(null),
  fileRef: text(60).default(''),
  // How many ticks the task needs; left out, academic entries use 3 and the rest 1.
  reps: z.number().int().min(1, 'at least 1').max(20, 'at most 20').optional(),
  repsDone: z.number().int().min(0).max(20).optional(),
});

/** Default number of ticks for a new task in an entry of this category. */
const defaultReps = (category) => (category === 'academic' ? 3 : 1);

// Keep existing step ids so tasks stay linked to their step after renames and reordering.
const withStepIds = (steps) => steps.map((s) => ({ id: s.id || crypto.randomBytes(6).toString('base64url'), name: s.name }));

const ENTITY_COLS = `e.id, e.category, e.title, e.description, e.color, e.status, e.steps, e.step_index, e.due_date,
  e.thumb IS NOT NULL AS has_thumb, e.created_at, e.updated_at`;

const entityOut = (r) => ({
  id: r.id,
  category: r.category,
  title: r.title,
  description: r.description,
  color: r.color,
  status: r.status,
  steps: r.steps,
  stepIndex: Math.min(r.step_index, r.steps.length),
  dueDate: r.due_date,
  thumbUrl: r.has_thumb ? `/api/w/entities/${r.id}/thumb?v=${new Date(r.updated_at).getTime()}` : null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.tasks_total !== undefined && {
    tasks: { total: r.tasks_total, done: r.tasks_done, overdue: r.tasks_overdue, next: r.next_task || null },
  }),
});

const taskOut = (r) => ({
  id: r.id,
  parentId: r.parent_id,
  stepId: r.step_id,
  title: r.title,
  notes: r.notes,
  done: r.done,
  reps: r.reps,
  repsDone: r.reps_done,
  priority: r.priority,
  dueDate: r.due_date,
  position: r.position,
  doneAt: r.done_at,
  fileId: r.file_id,
  fileRef: r.file_ref,
  createdAt: r.created_at,
});

export const FILE_COLS = 'id, entity_id, name, mime, size, local_key, data IS NOT NULL AS synced, created_at';
export const fileOut = (r) => ({
  id: r.id, entityId: r.entity_id, name: r.name, mime: r.mime, size: r.size, localKey: r.local_key, synced: r.synced, createdAt: r.created_at,
});

const touch = (db, entityId) => db.query('UPDATE wolf.entities SET updated_at = now() WHERE id = $1', [entityId]);

/* ---------- Entities ---------- */

router.get('/entities', async (req, res) => {
  const cat = CATEGORIES.includes(req.query.category) ? req.query.category : null;
  const { rows } = await query(`
    SELECT ${ENTITY_COLS},
      COUNT(t.id) FILTER (WHERE t.parent_id IS NULL)::int AS tasks_total,
      COUNT(t.id) FILTER (WHERE t.parent_id IS NULL AND t.done)::int AS tasks_done,
      COUNT(t.id) FILTER (WHERE NOT t.done AND t.due_date < CURRENT_DATE)::int AS tasks_overdue,
      (SELECT title FROM wolf.tasks n WHERE n.entity_id = e.id AND NOT n.done AND n.parent_id IS NULL
         ORDER BY n.due_date NULLS LAST, n.position, n.id LIMIT 1) AS next_task
    FROM wolf.entities e
    LEFT JOIN wolf.tasks t ON t.entity_id = e.id
    WHERE ($1::text IS NULL OR e.category = $1)
    GROUP BY e.id
    ORDER BY (e.status = 'archived'), (e.status = 'done'), e.updated_at DESC`, [cat]);
  res.json(rows.map(entityOut));
});

router.post('/entities', json(), async (req, res) => {
  const b = parse(entityBody, req.body);
  const steps = withStepIds(b.steps);
  const { rows } = await query(`
    INSERT INTO wolf.entities (category, title, description, color, status, due_date, steps, step_index)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING ${ENTITY_COLS.replaceAll('e.', '')}`,
    [b.category, b.title, b.description, b.color, b.status, b.dueDate, JSON.stringify(steps), Math.min(b.stepIndex, steps.length)]);
  res.status(201).json(entityOut(rows[0]));
});

router.get('/entities/:id', async (req, res) => {
  const eid = id(req.params.id);
  const { rows } = await query(`SELECT ${ENTITY_COLS} FROM wolf.entities e WHERE e.id = $1`, [eid]);
  if (!rows[0]) throw notFound('Entry');
  const [tasks, files, counts] = await Promise.all([
    query('SELECT * FROM wolf.tasks WHERE entity_id = $1 ORDER BY position, id', [eid]),
    query(`SELECT ${FILE_COLS} FROM wolf.files WHERE entity_id = $1 ORDER BY created_at DESC, id DESC`, [eid]),
    query(`SELECT (SELECT COUNT(*) FROM wolf.papers WHERE entity_id = $1)::int AS papers,
      (SELECT COUNT(*) FROM wolf.class_slots WHERE entity_id = $1)::int AS slots,
      (SELECT COUNT(*) FROM wolf.cts WHERE entity_id = $1)::int AS cts,
      (SELECT COUNT(*) FROM wolf.notes WHERE entity_id = $1 AND NOT done)::int AS notes`, [eid]),
  ]);
  res.json({ ...entityOut(rows[0]), taskList: tasks.rows.map(taskOut), fileList: files.rows.map(fileOut), fileLimitMb: config.maxFileMb, counts: counts.rows[0] });
});

// Partial update: any subset of the create fields.
router.patch('/entities/:id', json(), async (req, res) => {
  const eid = id(req.params.id);
  const b = parse(entityBody.partial(), req.body);
  const sets = [];
  const vals = [];
  const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (b.category !== undefined && 'category' in req.body) set('category', b.category);
  if ('title' in req.body) set('title', b.title);
  if ('description' in req.body) set('description', b.description);
  if ('color' in req.body) set('color', b.color);
  if ('status' in req.body) set('status', b.status);
  if ('dueDate' in req.body) set('due_date', b.dueDate);
  if ('steps' in req.body) set('steps', JSON.stringify(withStepIds(b.steps)));
  if ('stepIndex' in req.body) set('step_index', b.stepIndex);

  const row = await tx(async (db) => {
    vals.push(eid);
    const { rows } = await db.query(
      `UPDATE wolf.entities SET ${[...sets, 'updated_at = now()'].join(', ')} WHERE id = $${vals.length}
       RETURNING ${ENTITY_COLS.replaceAll('e.', '')}`, vals);
    if (!rows[0]) throw notFound('Entry');
    // Steps that were removed no longer tag their tasks.
    if ('steps' in req.body) {
      await db.query(`UPDATE wolf.tasks SET step_id = NULL WHERE entity_id = $1 AND step_id IS NOT NULL
        AND NOT (step_id = ANY (SELECT jsonb_array_elements(steps)->>'id' FROM wolf.entities WHERE id = $1))`, [eid]);
    }
    return rows[0];
  });
  res.json(entityOut(row));
});

router.delete('/entities/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM wolf.entities WHERE id = $1', [id(req.params.id)]);
  if (!rowCount) throw notFound('Entry');
  res.status(204).end();
});

/* ---------- Thumbnails (stored in the row; the browser resizes them first) ---------- */

const IMAGE_MAGIC = {
  'image/webp': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
};

router.put('/entities/:id/thumb', express.raw({ type: Object.keys(IMAGE_MAGIC), limit: '3mb' }), async (req, res) => {
  const eid = id(req.params.id);
  const type = req.get('content-type')?.split(';')[0];
  if (!Buffer.isBuffer(req.body) || !IMAGE_MAGIC[type]?.(req.body)) {
    return res.status(400).json({ error: 'Use a WebP, JPEG or PNG image' });
  }
  const { rows } = await query(
    `UPDATE wolf.entities SET thumb = $1, thumb_type = $2, updated_at = now() WHERE id = $3
     RETURNING ${ENTITY_COLS.replaceAll('e.', '')}`, [req.body, type, eid]);
  if (!rows[0]) throw notFound('Entry');
  res.json(entityOut(rows[0]));
});

router.delete('/entities/:id/thumb', async (req, res) => {
  const { rows } = await query(
    `UPDATE wolf.entities SET thumb = NULL, thumb_type = NULL, updated_at = now() WHERE id = $1
     RETURNING ${ENTITY_COLS.replaceAll('e.', '')}`, [id(req.params.id)]);
  if (!rows[0]) throw notFound('Entry');
  res.json(entityOut(rows[0]));
});

router.get('/entities/:id/thumb', async (req, res) => {
  const { rows } = await query('SELECT thumb, thumb_type FROM wolf.entities WHERE id = $1', [id(req.params.id)]);
  if (!rows[0]?.thumb) throw notFound('Thumbnail');
  // The URL carries a version, so the browser may keep it.
  res.set({ 'Content-Type': rows[0].thumb_type, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  res.send(rows[0].thumb);
});

/* ---------- Tasks ---------- */

async function checkLinks(db, entityId, { parentId, stepId, fileId }) {
  if (parentId) {
    const p = await db.query('SELECT parent_id FROM wolf.tasks WHERE id = $1 AND entity_id = $2', [parentId, entityId]);
    if (!p.rows[0]) throw httpError(400, 'parentId: that task is not in this entry');
    if (p.rows[0].parent_id) throw httpError(400, 'parentId: subtasks cannot have their own subtasks');
  }
  if (stepId) {
    const s = await db.query(`SELECT 1 FROM wolf.entities WHERE id = $1 AND steps @> $2::jsonb`, [entityId, JSON.stringify([{ id: stepId }])]);
    if (!s.rows[0]) throw httpError(400, 'stepId: that step does not exist');
  }
  if (fileId) {
    const f = await db.query('SELECT 1 FROM wolf.files WHERE id = $1 AND entity_id = $2', [fileId, entityId]);
    if (!f.rows[0]) throw httpError(400, 'fileId: that file is not in this entry');
  }
}

router.post('/entities/:id/tasks', json(), async (req, res) => {
  const eid = id(req.params.id);
  const b = parse(taskBody, req.body);
  const row = await tx(async (db) => {
    const e = await db.query('SELECT category FROM wolf.entities WHERE id = $1 FOR UPDATE', [eid]);
    if (!e.rows[0]) throw notFound('Entry');
    await checkLinks(db, eid, b);
    const reps = b.reps ?? defaultReps(e.rows[0].category);
    const repsDone = b.done ? reps : Math.min(b.repsDone ?? 0, reps);
    const { rows } = await db.query(`
      INSERT INTO wolf.tasks (entity_id, parent_id, step_id, title, notes, done, priority, due_date, file_id, file_ref, done_at, reps, reps_done, position)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $6 THEN now() END, $11, $12,
        (SELECT COALESCE(MAX(position), 0) + 1 FROM wolf.tasks WHERE entity_id = $1 AND parent_id IS NOT DISTINCT FROM $2))
      RETURNING *`, [eid, b.parentId, b.stepId, b.title, b.notes, repsDone >= reps, b.priority, b.dueDate, b.fileId, b.fileId ? b.fileRef : '', reps, repsDone]);
    await touch(db, eid);
    return rows[0];
  });
  res.status(201).json(taskOut(row));
});

router.patch('/tasks/:id', json(), async (req, res) => {
  const tid = id(req.params.id);
  const b = parse(taskBody.omit({ parentId: true }).partial(), req.body);
  const row = await tx(async (db) => {
    const cur = await db.query('SELECT entity_id, reps, reps_done, done FROM wolf.tasks WHERE id = $1 FOR UPDATE', [tid]);
    if (!cur.rows[0]) throw notFound('Task');
    const eid = cur.rows[0].entity_id;
    if ('stepId' in req.body || 'fileId' in req.body) await checkLinks(db, eid, { stepId: b.stepId, fileId: b.fileId });
    const sets = [];
    const vals = [];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if ('title' in req.body) set('title', b.title);
    if ('notes' in req.body) set('notes', b.notes);
    if ('priority' in req.body) set('priority', b.priority);
    if ('dueDate' in req.body) set('due_date', b.dueDate);
    if ('stepId' in req.body) set('step_id', b.stepId);
    if ('fileId' in req.body) set('file_id', b.fileId);
    if ('fileRef' in req.body) set('file_ref', b.fileRef);
    // Ticks and done move together: a task is done once every tick is ticked.
    let nowDone = cur.rows[0].done;
    if ('reps' in req.body || 'repsDone' in req.body || 'done' in req.body) {
      const reps = b.reps ?? cur.rows[0].reps;
      const repsDone = 'repsDone' in req.body ? Math.min(b.repsDone, reps)
        : 'done' in req.body ? (b.done ? reps : 0)
        : Math.min(cur.rows[0].reps_done, reps);
      nowDone = repsDone >= reps;
      set('reps', reps);
      set('reps_done', repsDone);
      set('done', nowDone);
      sets.push(`done_at = CASE WHEN $${vals.length} THEN COALESCE(done_at, now()) END`);
    }
    if (!sets.length) throw httpError(400, 'Nothing to change');
    vals.push(tid);
    const { rows } = await db.query(`UPDATE wolf.tasks SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
    // Finishing a task finishes its subtasks too.
    if (nowDone && !cur.rows[0].done) {
      await db.query('UPDATE wolf.tasks SET done = TRUE, reps_done = reps, done_at = COALESCE(done_at, now()) WHERE parent_id = $1', [tid]);
    }
    await touch(db, eid);
    return rows[0];
  });
  res.json(taskOut(row));
});

// Set the order of a group of sibling tasks (top-level tasks, or one task's subtasks).
router.put('/entities/:id/task-order', json(), async (req, res) => {
  const eid = id(req.params.id);
  const b = parse(z.object({
    parentId: z.number().int().positive().nullable().default(null),
    ids: z.array(z.number().int().positive()).min(1).max(2000),
  }), req.body);
  await tx(async (db) => {
    const { rows } = await db.query(
      'SELECT id FROM wolf.tasks WHERE entity_id = $1 AND parent_id IS NOT DISTINCT FROM $2 FOR UPDATE', [eid, b.parentId]);
    const have = new Set(rows.map((r) => r.id));
    if (b.ids.length !== have.size || new Set(b.ids).size !== have.size || !b.ids.every((x) => have.has(x))) {
      throw httpError(400, 'ids: list every task in the group exactly once');
    }
    await db.query(`UPDATE wolf.tasks t SET position = o.pos FROM unnest($1::int[]) WITH ORDINALITY AS o(id, pos) WHERE t.id = o.id`, [b.ids]);
    await touch(db, eid);
  });
  res.status(204).end();
});

router.delete('/tasks/:id', async (req, res) => {
  const { rows } = await query('DELETE FROM wolf.tasks WHERE id = $1 RETURNING entity_id', [id(req.params.id)]);
  if (!rows[0]) throw notFound('Task');
  await touch({ query }, rows[0].entity_id);
  res.status(204).end();
});

router.use(errorHandler);
