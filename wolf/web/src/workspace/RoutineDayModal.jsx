import { useState } from 'react';
import { Link } from 'react-router-dom';
import { w } from '../api.js';
import { ErrorNote, Field, Icon, Modal, toast } from '../ui.jsx';
import { toggleEvent } from './AgendaItem.jsx';
import { timeRange } from './meta.js';

/**
 * One day of a routine: tick it off, move it to another time on this date only, or skip it.
 * e is a calendar item of type 'routine'. onSaved runs after any change, so the caller can reload.
 */
export default function RoutineDayModal({ e, onClose, onSaved }) {
  const [f, setF] = useState({ start: e.time || e.usualTime || '', end: e.endTime || e.usualEndTime || '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const dayLabel = new Date(`${e.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const url = `routines/${e.id}/changes/${e.date}`;

  const run = async (fn, message) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      if (message) toast(message);
      onSaved?.();
      onClose();
    } catch (e2) {
      setErr(e2);
      setBusy(false);
    }
  };

  const moveTime = (ev) => {
    ev.preventDefault();
    run(() => w(url, { method: 'PUT', body: { start: f.start || null, end: f.end || null } }), `Changed for ${dayLabel} only`);
  };
  const skip = () => run(() => w(url, { method: 'PUT', body: { skipped: true } }), `Skipped on ${dayLabel}`);
  const reset = () => run(() => w(url, { method: 'DELETE' }), 'Back to the usual time');
  const tick = () => run(() => toggleEvent(e), e.done ? null : 'Ticked off');

  return (
    <Modal title={e.title} onClose={onClose}>
      <div className="routine-day-head" style={{ '--biz': e.color }}>
        <span className="routine-dot" aria-hidden="true" />
        <div>
          <p className="strong">{dayLabel}</p>
          <p className="sub">
            {e.skipped ? 'Skipped this day' : timeRange(e.time, e.endTime)}
            {e.changed && !e.skipped && ` · usually ${timeRange(e.usualTime, e.usualEndTime)}`}
            {e.entityTitle && ` · ${e.entityTitle}`}
          </p>
        </div>
      </div>

      {!e.skipped && (
        <button type="button" className={`btn ${e.done ? 'btn-ghost' : 'btn-primary'}`} disabled={busy} onClick={tick}>
          <Icon name="check" size={15} />{e.done ? 'Not done yet' : 'Mark done for this day'}
        </button>
      )}

      <form className="record-form" onSubmit={moveTime}>
        <p className="field-label">{e.skipped ? 'Do it this day after all, at' : 'Different time on this day only'}</p>
        <div className="grid-2">
          <Field label="Starts"><input className="input" type="time" value={f.start} onChange={(ev) => setF({ ...f, start: ev.target.value })} required /></Field>
          <Field label="Ends"><input className="input" type="time" value={f.end} onChange={(ev) => setF({ ...f, end: ev.target.value })} /></Field>
        </div>
        <p className="sub">Other {new Date(`${e.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })}s keep their usual time.</p>
        <div className="record-form-actions">
          <button className="btn btn-primary btn-sm" disabled={busy || !f.start}>Save for this day</button>
        </div>
      </form>

      <ErrorNote error={err} />
      <div className="record-form-actions">
        <Link to={`/routine?edit=${e.id}`} className="btn btn-ghost btn-sm push-right" onClick={onClose}><Icon name="edit" size={15} />Edit every week</Link>
        {e.changed && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={reset}>Back to usual</button>}
        {!e.skipped && <button type="button" className="btn btn-danger-ghost btn-sm" disabled={busy} onClick={skip}>Skip this day</button>}
      </div>
    </Modal>
  );
}
