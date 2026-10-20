// Files (PDFs, docs, slides) and short notes, for every kind of entry.
import express from 'express';
import { z } from 'zod';
import { config } from './config.js';
import { query } from './db.js';
import { errorHandler, httpError, id, json as parseJson, notFound, parse, text, updates } from './validate.js';
import { FILE_COLS, fileOut } from './workspace.js';

export const router = express.Router();
const json = parseJson();


async function checkEntity(eid) {
  const { rows } = await query('SELECT 1 FROM wolf.entities WHERE id = $1', [eid]);
  if (!rows[0]) throw notFound('Entry');
}
const touch = (eid) => query('UPDATE wolf.entities SET updated_at = now() WHERE id = $1', [eid]);

/* ---------- Files ---------- */

// A file is added in two steps. The browser keeps the bytes and registers only the name, type and size
// here, so tasks can link to it. Sync (PUT /files/:id/data) is what copies the bytes to the server.

// Only these open in the browser; everything else downloads, so an uploaded page can never run as Wolf.
// Keep in step with VIEWABLE in web/src/workspace/meta.js.
const INLINE = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'text/plain',
  'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg',
]);

const fileName = (v) => {
  const name = String(v || '').replace(/[\\/\u0000-\u001f]/g, '').trim().slice(0, 200);
  if (!name) throw httpError(400, 'name: the file needs a name');
  return name;
};
const mimeOf = (v) => {
  const m = String(v || '').split(';')[0].trim().toLowerCase();
  return /^[\w.+-]+\/[\w.+-]+$/.test(m) ? m : 'application/octet-stream';
};

const fileBody = z.object({
  name: z.string().max(400),
  mime: z.string().max(200).default(''),
  size: z.number().int().min(0).max(2 ** 31 - 1),
  localKey: z.string().regex(/^[\w-]{8,64}$/, 'use the id the browser gave the file'),
});

router.get('/entities/:id/files', async (req, res) => {
  const eid = id(req.params.id);
  await checkEntity(eid);
  const { rows } = await query(`SELECT ${FILE_COLS} FROM wolf.files WHERE entity_id = $1 ORDER BY created_at DESC, id DESC`, [eid]);
  res.json(rows.map(fileOut));
});

router.post('/entities/:id/files', json, async (req, res) => {
  // Pages from before files stayed on the device sent the bytes here. Tell them to reload rather than fail on "name".
  if (!req.is('application/json')) throw httpError(409, 'Wolf has been updated. Reload the page and add the file again.');
  const eid = id(req.params.id);
  const b = parse(fileBody, req.body);
  await checkEntity(eid);
  const { rows } = await query(
    `INSERT INTO wolf.files (entity_id, name, mime, size, local_key) VALUES ($1, $2, $3, $4, $5) RETURNING ${FILE_COLS}`,
    [eid, fileName(b.name), mimeOf(b.mime), b.size, b.localKey]);
  await touch(eid);
  res.status(201).json(fileOut(rows[0]));
});

// Sync: the raw bytes of a registered file. The size must match what was registered.
router.put('/files/:id/data', express.raw({ type: () => true, limit: `${config.maxFileMb}mb` }), async (req, res) => {
  const fid = id(req.params.id);
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw httpError(400, 'The file is empty');
  const { rows } = await query(
    `UPDATE wolf.files SET data = $1 WHERE id = $2 AND size = $3 RETURNING ${FILE_COLS}`, [req.body, fid, req.body.length]);
  if (!rows[0]) {
    const exists = await query('SELECT 1 FROM wolf.files WHERE id = $1', [fid]);
    throw exists.rows[0] ? httpError(400, 'That is not the same file (the size differs)') : notFound('File');
  }
  res.json(fileOut(rows[0]));
});

router.patch('/files/:id', json, async (req, res) => {
  const name = fileName(req.body.name);
  const { rows } = await query(`UPDATE wolf.files SET name = $1 WHERE id = $2 RETURNING ${FILE_COLS}`, [name, id(req.params.id)]);
  if (!rows[0]) throw notFound('File');
  res.json(fileOut(rows[0]));
});

router.delete('/files/:id', async (req, res) => {
  const { rows } = await query('DELETE FROM wolf.files WHERE id = $1 RETURNING entity_id', [id(req.params.id)]);
  if (!rows[0]) throw notFound('File');
  await touch(rows[0].entity_id);
  res.status(204).end();
});

router.get('/files/:id', async (req, res) => {
  const { rows } = await query('SELECT name, mime, data FROM wolf.files WHERE id = $1', [id(req.params.id)]);
  if (!rows[0]) throw notFound('File');
  const f = rows[0];
  if (!f.data) throw httpError(404, 'This file has not been synced. Open it on the device that added it, or sync it there.');
  const inline = INLINE.has(f.mime) && !('download' in req.query);
  res.set({
    'Content-Type': inline ? (f.mime === 'text/plain' ? 'text/plain; charset=utf-8' : f.mime) : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(f.data);
});

/* ---------- Notes and reminders ---------- */

const noteBody = z.object({
  body: text(2000).min(1, 'write something'),
  remindAt: z.string().datetime({ offset: true, message: 'pick a date and time' }).nullable().default(null),
  done: z.boolean().default(false),
});
const NOTE_COLUMNS = { body: 'body', remindAt: 'remind_at', done: 'done' };

export const noteOut = (r) => ({
  id: r.id, entityId: r.entity_id, body: r.body, remindAt: r.remind_at, done: r.done, createdAt: r.created_at,
  ...(r.entity_title !== undefined && { entityTitle: r.entity_title, color: r.color, category: r.category }),
});

// Open notes first: reminders by time, then plain notes newest first.
router.get('/entities/:id/notes', async (req, res) => {
  const eid = id(req.params.id);
  await checkEntity(eid);
  const { rows } = await query(
    'SELECT * FROM wolf.notes WHERE entity_id = $1 ORDER BY done, remind_at NULLS LAST, created_at DESC', [eid]);
  res.json(rows.map(noteOut));
});

router.post('/entities/:id/notes', json, async (req, res) => {
  const eid = id(req.params.id);
  const b = parse(noteBody, req.body);
  await checkEntity(eid);
  const { rows } = await query(
    'INSERT INTO wolf.notes (entity_id, body, remind_at, done) VALUES ($1, $2, $3, $4) RETURNING *', [eid, b.body, b.remindAt, b.done]);
  await touch(eid);
  res.status(201).json(noteOut(rows[0]));
});

router.patch('/notes/:id', json, async (req, res) => {
  const b = parse(noteBody.partial(), req.body);
  const { sets, vals } = updates(req.body, b, NOTE_COLUMNS);
  vals.push(id(req.params.id));
  const { rows } = await query(`UPDATE wolf.notes SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
  if (!rows[0]) throw notFound('Note');
  res.json(noteOut(rows[0]));
});

router.delete('/notes/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM wolf.notes WHERE id = $1', [id(req.params.id)]);
  if (!rowCount) throw notFound('Note');
  res.status(204).end();
});

router.use(errorHandler);
