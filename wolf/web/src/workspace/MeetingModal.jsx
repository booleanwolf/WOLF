import { useState } from 'react';
import { w } from '../api.js';
import { useAsync } from '../useAsync.js';
import { ErrorNote, Field, Icon, Loading, Modal, toast } from '../ui.jsx';
import { CATEGORIES, today } from './meta.js';

const blank = (initial) => ({
  title: '', date: today(), start: '', end: '', location: '', link: '', entityId: '', notes: '',
  ...initial,
});

/**
 * Schedule a meeting, or edit one. Pass id to load an existing meeting,
 * or initial (e.g. { entityId, date }) to prefill a new one.
 */
export default function MeetingModal({ id, initial, onClose, onSaved }) {
  const existing = useAsync(() => (id ? w(`meetings/${id}`) : Promise.resolve(null)), [id]);
  const entities = useAsync(() => w('entities'), []);
  if (id && !existing.data) {
    return (
      <Modal title="Meeting" onClose={onClose}>
        {existing.loading ? <Loading /> : <ErrorNote error={existing.error} onRetry={existing.reload} />}
      </Modal>
    );
  }
  return <MeetingForm key={id || 'new'} meeting={existing.data} initial={initial} entities={entities.data || []} onClose={onClose} onSaved={onSaved} />;
}

function MeetingForm({ meeting, initial, entities, onClose, onSaved }) {
  const [f, setF] = useState(() => blank(meeting
    ? { ...meeting, start: meeting.start || '', end: meeting.end || '', entityId: meeting.entityId ? String(meeting.entityId) : '' }
    : { ...initial, entityId: initial?.entityId ? String(initial.entityId) : '' }));
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const body = {
      title: f.title.trim(), date: f.date, start: f.start || null, end: f.end || null, location: f.location.trim(),
      link: f.link.trim(), entityId: f.entityId ? Number(f.entityId) : null, notes: f.notes.trim(),
    };
    try {
      const saved = meeting
        ? await w(`meetings/${meeting.id}`, { method: 'PATCH', body })
        : await w('meetings', { method: 'POST', body });
      toast(meeting ? 'Meeting saved' : 'Meeting scheduled');
      onSaved?.(saved);
      onClose();
    } catch (e2) {
      setErr(e2);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete the meeting "${meeting.title}"?`)) return;
    try {
      await w(`meetings/${meeting.id}`, { method: 'DELETE' });
      toast('Meeting deleted');
      onSaved?.(null);
      onClose();
    } catch (e2) { setErr(e2); }
  };

  return (
    <Modal title={meeting ? 'Meeting' : 'Schedule a meeting'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="What"><input className="input" value={f.title} onChange={set('title')} maxLength={160} required autoFocus placeholder="Supervisor meeting" /></Field>
        <div className="grid-3">
          <Field label="Date"><input className="input" type="date" value={f.date} onChange={set('date')} required /></Field>
          <Field label="Starts"><input className="input" type="time" value={f.start} onChange={set('start')} /></Field>
          <Field label="Ends"><input className="input" type="time" value={f.end} onChange={set('end')} /></Field>
        </div>
        <div className="grid-2">
          <Field label="Where" hint="Room or place. Optional."><input className="input" value={f.location} onChange={set('location')} maxLength={200} placeholder="Room 402" /></Field>
          <Field label="Call link" hint="Meet, Zoom or Teams. Optional."><input className="input" type="url" value={f.link} onChange={set('link')} placeholder="https://meet.google.com/…" /></Field>
        </div>
        <Field label="Part of" hint="Optional link to an entry.">
          <select className="input select" value={f.entityId} onChange={set('entityId')}>
            <option value="">Nothing</option>
            {entities.filter((e) => e.status !== 'archived' || String(e.id) === f.entityId).map((e) => (
              <option key={e.id} value={e.id}>{CATEGORIES[e.category].label}: {e.title}</option>
            ))}
          </select>
        </Field>
        <Field label="Agenda or notes"><textarea className="input" rows={3} value={f.notes} onChange={set('notes')} maxLength={4000} /></Field>
        <ErrorNote error={err} />
        <div className="record-form-actions">
          {meeting && <button type="button" className="btn btn-danger-ghost btn-sm modal-left" onClick={remove}><Icon name="trash" size={15} />Delete</button>}
          {meeting?.link && <a className="btn btn-ghost btn-sm" href={meeting.link} target="_blank" rel="noreferrer"><Icon name="external" size={15} />Join</a>}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : meeting ? 'Save' : 'Schedule'}</button>
        </div>
      </form>
    </Modal>
  );
}
