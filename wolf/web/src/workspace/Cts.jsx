import { useState } from 'react';
import { Badge, ErrorNote, Field, Icon, Loading, toast } from '../ui.jsx';
import { clock, isOverdue, shortDate } from './meta.js';
import { useRecords } from './useRecords.js';

const sort = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.id - b.id;
export const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));
export const pct = (m, t) => Math.round((m / t) * 100);

// "Count best N" is a per-course view setting, kept in this browser.
const bestKey = (entityId) => `wolf-ct-best-${entityId}`;
export const readBest = (entityId) => { try { return Number(localStorage.getItem(bestKey(entityId))) || 0; } catch { return 0; } };

/** Marked CTs, the ones counted (best N if chosen) and their totals. */
export function ctSummary(list, best) {
  const marked = list.filter((c) => c.marks != null);
  const counted = best && best < marked.length
    ? [...marked].sort((a, b) => b.marks / b.total - a.marks / a.total).slice(0, best)
    : marked;
  const got = counted.reduce((s, c) => s + c.marks, 0);
  const outOf = counted.reduce((s, c) => s + c.total, 0);
  return { marked, counted, got, outOf, best: best && best < marked.length ? best : 0 };
}

function CtForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        title: f.title.trim(), date: f.date || null, time: f.time || null, syllabus: f.syllabus.trim(),
        marks: f.marks === '' ? null : Number(f.marks), total: Number(f.total) || 20,
      });
    } catch (e2) {
      setErr(e2);
      setBusy(false);
    }
  };

  return (
    <form className="record-form" onSubmit={submit}>
      <div className="grid-3">
        <Field label="Name"><input className="input" value={f.title} onChange={set('title')} maxLength={80} required /></Field>
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Time"><input className="input" type="time" value={f.time} onChange={set('time')} /></Field>
      </div>
      <Field label="Syllabus" hint="Chapters or topics this CT covers.">
        <textarea className="input" rows={2} value={f.syllabus} onChange={set('syllabus')} maxLength={2000} />
      </Field>
      <div className="grid-3">
        <Field label="Marks obtained" hint="Leave empty until you get it back.">
          <input className="input tnum" type="number" min="0" step="0.25" value={f.marks} onChange={set('marks')} />
        </Field>
        <Field label="Out of"><input className="input tnum" type="number" min="0.25" step="0.25" value={f.total} onChange={set('total')} required /></Field>
      </div>
      <ErrorNote error={err} />
      <div className="record-form-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save CT'}</button>
      </div>
    </form>
  );
}

/** Class tests: dates and syllabus before, marks after. Summary counts the best N if chosen. */
export default function Cts({ entity, onCount }) {
  const r = useRecords(entity.id, 'cts', sort);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [best, setBest] = useState(() => readBest(entity.id));
  const pickBest = (n) => { setBest(n); try { localStorage.setItem(bestKey(entity.id), String(n)); } catch {} };

  const { marked, counted, got, outOf } = ctSummary(r.list, best);
  const countedIds = new Set(counted.map((c) => c.id));
  const blank = { title: `CT ${r.list.length + 1}`, date: '', time: '', syllabus: '', marks: '', total: '20' };

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>CTs <span className="dash-count">{r.list.length}</span></h3>
          <p className="sub">Class test dates, syllabus and marks. Upcoming CTs show on your calendar.</p>
        </div>
        {!adding && <button className="btn btn-primary btn-sm" onClick={() => { setAdding(true); setEditing(null); }}><Icon name="plus" size={15} />Add CT</button>}
      </div>

      {marked.length > 0 && (
        <div className="ct-summary">
          <div className="kpi">
            <span className="kpi-label">{best && best < marked.length ? `Best ${best} of ${marked.length}` : `${marked.length} marked`}</span>
            <span className="kpi-value tnum">{fmt(got)}<span className="kpi-of">/{fmt(outOf)}</span></span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Average</span>
            <span className="kpi-value tnum">{pct(got, outOf)}%</span>
          </div>
          {marked.length > 1 && (
            <label className="inv-input ct-best">Count
              <select className="input select" value={best} onChange={(e) => pickBest(Number(e.target.value))}>
                <option value={0}>All CTs</option>
                {Array.from({ length: marked.length - 1 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Best {n}</option>)}
              </select>
            </label>
          )}
        </div>
      )}

      {adding && (
        <CtForm initial={blank} onCancel={() => setAdding(false)}
          onSave={async (b) => { await r.add(b); setAdding(false); onCount?.(1); toast('CT added'); }} />
      )}

      {r.loading && !r.data && <Loading />}
      <ErrorNote error={r.error} onRetry={r.reload} />
      {r.data && !r.list.length && !adding && <p className="empty">No CTs yet. Add them as they are announced.</p>}

      <ul className="record-list">
        {r.list.map((c) => (
          <li key={c.id} className="record">
            {editing === c.id ? (
              <CtForm initial={{ ...c, date: c.date || '', time: c.time || '', marks: c.marks ?? '', total: String(c.total) }}
                onCancel={() => setEditing(null)} onSave={async (b) => { await r.update(c.id, b); setEditing(null); toast('CT saved'); }} />
            ) : (
              <div className="record-row">
                <span className="record-main is-static">
                  <span className="strong">{c.title}</span>
                  <span className="sub">
                    {c.date ? `${shortDate(c.date)}${c.time ? `, ${clock(c.time)}` : ''}` : 'No date yet'}
                    {c.syllabus && ` · ${c.syllabus}`}
                  </span>
                </span>
                <span className="ct-marks">
                  {c.marks != null ? (
                    <>
                      <span className={`strong tnum ${countedIds.has(c.id) ? '' : 'muted'}`}>{fmt(c.marks)}/{fmt(c.total)}</span>
                      <span className="sub tnum">{pct(c.marks, c.total)}%</span>
                    </>
                  ) : c.date && isOverdue(c.date) ? <Badge tone="warn">Awaiting marks</Badge> : <Badge tone="info">Upcoming</Badge>}
                </span>
                <div className="task-actions is-shown">
                  <button type="button" className="icon-btn" onClick={() => { setEditing(c.id); setAdding(false); }} aria-label={`Edit ${c.title}`} title="Edit"><Icon name="edit" size={16} /></button>
                  <button type="button" className="icon-btn danger" onClick={async () => { if (await r.remove(c.id, c.title)) onCount?.(-1); }} aria-label={`Delete ${c.title}`} title="Delete"><Icon name="trash" size={16} /></button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
