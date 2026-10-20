import { useState } from 'react';
import { Badge, ErrorNote, Field, Icon, Loading, toast } from '../ui.jsx';
import { WEEKDAYS, timeRange, weekOrder } from './meta.js';
import { useRecords } from './useRecords.js';

const KIND = { class: { label: 'Class', tone: 'info' }, lab: { label: 'Lab', tone: 'accent' } };
const order = weekOrder();
const sort = (a, b) => order.indexOf(a.weekday) - order.indexOf(b.weekday) || a.start.localeCompare(b.start);

function SlotForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSave({ kind: f.kind, weekday: Number(f.weekday), start: f.start, end: f.end, location: f.location.trim(), note: f.note.trim() });
    } catch (e2) {
      setErr(e2);
      setBusy(false);
    }
  };

  return (
    <form className="record-form" onSubmit={submit}>
      <div className="grid-3">
        <Field label="Type">
          <div className="segmented">
            {Object.entries(KIND).map(([k, v]) => (
              <button key={k} type="button" className={f.kind === k ? 'is-on' : ''} onClick={() => setF({ ...f, kind: k })}>{v.label}</button>
            ))}
          </div>
        </Field>
        <Field label="Day">
          <select className="input select" value={f.weekday} onChange={set('weekday')}>
            {order.map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
          </select>
        </Field>
        <Field label="Room"><input className="input" value={f.location} onChange={set('location')} maxLength={120} placeholder="ECE 301" /></Field>
      </div>
      <div className="grid-3">
        <Field label="Starts"><input className="input" type="time" value={f.start} onChange={set('start')} required /></Field>
        <Field label="Ends"><input className="input" type="time" value={f.end} onChange={set('end')} required /></Field>
        <Field label="Note"><input className="input" value={f.note} onChange={set('note')} maxLength={200} placeholder="Section B" /></Field>
      </div>
      <ErrorNote error={err} />
      <div className="record-form-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save time'}</button>
      </div>
    </form>
  );
}

/** Weekly class and lab times for a course. They also show on the routine board and calendar. */
export default function Schedule({ entity, onCount }) {
  const r = useRecords(entity.id, 'slots', sort);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const days = order.filter((d) => r.list.some((s) => s.weekday === d));
  const blank = { kind: 'class', weekday: String(new Date().getDay()), start: '08:00', end: '08:50', location: '', note: '' };

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Class and lab times</h3>
          <p className="sub">Repeats every week. Shows on your routine and calendar while the course is active.</p>
        </div>
        {!adding && <button className="btn btn-primary btn-sm" onClick={() => { setAdding(true); setEditing(null); }}><Icon name="plus" size={15} />Add time</button>}
      </div>

      {adding && (
        <SlotForm initial={blank} onCancel={() => setAdding(false)}
          onSave={async (b) => { await r.add(b); setAdding(false); onCount?.(1); toast('Time added'); }} />
      )}

      {r.loading && !r.data && <Loading />}
      <ErrorNote error={r.error} onRetry={r.reload} />
      {r.data && !r.list.length && !adding && <p className="empty">No class or lab times yet.</p>}

      {days.map((d) => (
        <div key={d} className="slot-day">
          <p className="agenda-group">{WEEKDAYS[d]}</p>
          <ul className="record-list">
            {r.list.filter((s) => s.weekday === d).map((s) => (
              <li key={s.id} className="record">
                {editing === s.id ? (
                  <SlotForm initial={{ ...s, weekday: String(s.weekday) }} onCancel={() => setEditing(null)}
                    onSave={async (b) => { await r.update(s.id, b); setEditing(null); toast('Time saved'); }} />
                ) : (
                  <div className="record-row">
                    <Badge tone={KIND[s.kind].tone}>{KIND[s.kind].label}</Badge>
                    <span className="record-main is-static">
                      <span className="strong tnum">{timeRange(s.start, s.end)}</span>
                      <span className="sub">{[s.location, s.note].filter(Boolean).join(' · ') || ' '}</span>
                    </span>
                    <div className="task-actions is-shown">
                      <button type="button" className="icon-btn" onClick={() => { setEditing(s.id); setAdding(false); }} aria-label="Edit time" title="Edit"><Icon name="edit" size={16} /></button>
                      <button type="button" className="icon-btn danger" onClick={async () => { if (await r.remove(s.id, `this ${KIND[s.kind].label.toLowerCase()} time`)) onCount?.(-1); }} aria-label="Delete time" title="Delete"><Icon name="trash" size={16} /></button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
