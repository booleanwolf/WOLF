// Shared maths for the day and week timelines: where blocks go, and what time is left free.
import { clock } from './meta.js';

export const HOUR_PX = 52;
export const MIN_PX = HOUR_PX / 60;
// Items with a start but no end (CTs, meetings without an end) are assumed to take this long.
const DEFAULT_MIN = 60;
// Gaps shorter than this are not worth calling free time.
const MIN_FREE = 15;
const HOURS_KEY = 'wolf-day-hours';
const DEFAULT_HOURS = { from: 8, to: 23 };

export const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const toTime = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const span = (a, b) => `${clock(toTime(a))} – ${clock(toTime(b))}`;

/** 150 -> '2 h 30 m' */
export function duration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h && `${h} h`, m && `${m} m`].filter(Boolean).join(' ') || '0 m';
}

/** Waking hours, as whole hours { from, to }; free time is only counted inside them. */
export function readHours() {
  try {
    const v = JSON.parse(localStorage.getItem(HOURS_KEY));
    if (Number.isInteger(v?.from) && Number.isInteger(v?.to) && v.from < v.to) return v;
  } catch {}
  return DEFAULT_HOURS;
}
export function saveHours(v) {
  try { localStorage.setItem(HOURS_KEY, JSON.stringify(v)); } catch {}
}

/** Timed items as blocks { e, start, end, col, cols }, with overlapping ones side by side in columns. */
export function layout(events) {
  const blocks = events
    .filter((e) => e.time && !e.skipped)
    .map((e) => {
      const start = toMin(e.time);
      const end = e.endTime && toMin(e.endTime) > start ? toMin(e.endTime) : Math.min(start + DEFAULT_MIN, 24 * 60);
      return { e, start, end, guessed: !e.endTime };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  // Walk through clusters of items that overlap each other; each takes the first free column in its cluster.
  let cluster = [];
  let clusterEnd = -1;
  const close = () => {
    const cols = Math.max(...cluster.map((b) => b.col)) + 1;
    for (const b of cluster) b.cols = cols;
    cluster = [];
  };
  for (const b of blocks) {
    if (cluster.length && b.start >= clusterEnd) close();
    const used = new Set(cluster.filter((c) => c.end > b.start).map((c) => c.col));
    b.col = 0;
    while (used.has(b.col)) b.col++;
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  if (cluster.length) close();
  return blocks;
}

/** Free stretches [start, end] between from and to (minutes) that no block covers. */
export function freeTime(blocks, from, to) {
  const busy = blocks.map((b) => [b.start, b.end]).sort((a, b) => a[0] - b[0]);
  const free = [];
  let cursor = from;
  for (const [s, e] of busy) {
    if (s > cursor) free.push([cursor, Math.min(s, to)]);
    cursor = Math.max(cursor, e);
    if (cursor >= to) break;
  }
  if (cursor < to) free.push([cursor, to]);
  return free.filter(([s, e]) => e - s >= MIN_FREE);
}

/** Free time on one date, given its blocks: none for past days, and only what is left of today. */
export function freeOn(date, blocks, hours, todayStr, nowMin) {
  if (date < todayStr) return [];
  const from = date === todayStr ? Math.max(hours.from * 60, Math.ceil(nowMin / 5) * 5) : hours.from * 60;
  return freeTime(blocks, from, hours.to * 60);
}

/** Hours shown: the waking hours, stretched to whole hours around anything earlier or later. */
export function shownRange(blocks, hours) {
  return {
    from: Math.floor(Math.min(hours.from * 60, ...blocks.map((b) => b.start)) / 60) * 60,
    to: Math.ceil(Math.max(hours.to * 60, ...blocks.map((b) => b.end)) / 60) * 60,
  };
}

export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
