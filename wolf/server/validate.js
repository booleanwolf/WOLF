// Small helpers shared by the workspace routers.
import express from 'express';
import { z } from 'zod';

/** JSON body parser that always leaves an object in req.body (Express 5 leaves it undefined for empty requests). */
export const json = (limit = '100kb') => [express.json({ limit }), (req, res, next) => { req.body ??= {}; next(); }];

export const text = (max) => z.string().trim().max(max);
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD').nullable();
export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM');

export const httpError = (status, message) => Object.assign(new Error(message), { status });
export const notFound = (what = 'Item') => httpError(404, `${what} not found`);

export function parse(schema, body) {
  const r = schema.safeParse(body ?? {});
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  throw httpError(400, `${issue.path.join('.') || 'body'}: ${issue.message}`);
}

export const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
};

/** Builds "col = $n" pairs for the keys present in body. map: { bodyKey: column }. */
export function updates(body, parsed, map) {
  const sets = [];
  const vals = [];
  for (const [key, col] of Object.entries(map)) {
    if (!(key in body)) continue;
    vals.push(parsed[key]);
    sets.push(`${col} = $${vals.length}`);
  }
  if (!sets.length) throw httpError(400, 'Nothing to change');
  return { sets, vals };
}

// Errors thrown with a status become JSON replies; anything else is a 500.
export function errorHandler(err, req, res, next) {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That file is too large' });
  next(err);
}

/** 'YYYY-MM-DD' helpers that never touch the server's time zone. */
export const weekdayOf = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
export const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
