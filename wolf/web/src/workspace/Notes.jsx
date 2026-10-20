import { useState } from 'react';
import { w } from '../api.js';
import { dateTime } from '../format.js';
import { ErrorNote, Icon, Loading, Modal, toast } from '../ui.jsx';
import { localDate } from './meta.js';
import { useRecords } from './useRecords.js';

/** ISO time -> the 'YYYY-MM-DDTHH:MM' a datetime-local input wants, in local time. */
const toInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${localDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fromInput = (v) => (v ? new Date(v).toISOString() : null);

export const isDue = (n) => Boolean(n.remindAt) && !n.done && new Date(n.remindAt) <= new Date();

export function ReminderChip({ note }) {
  if (!note.remindAt) return null;
  const due = isDue(note);
  return <span className={`chip ${due ? 'is-late' : ''}`}><Icon name="bell" size={13} />{dateTime(note.remindAt)}</span>;
}

function NoteForm({ initial, onSave, onCancel, submitLabel }) {
  const [body, setBody] = useState(initial.body);
  const [remind, setRemind] = useState(Boolean(initial.remindAt));
  const [at, setAt] = useState(toInput(initial.remindAt) || `${localDate(new Date())}T09:00`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await onSave({ body: body.trim(), remindAt: remind ? fromInput(at) : null });
      if (!initial.id) { setBody(''); setRemind(false); }
    } catch (e2) {
      setErr(e2);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="note-form" onSubmit={submit}>
      <textarea className="input" rows={2} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000}
        placeholder="Write a note…" aria-label="Note" autoFocus={Boolean(initial.id)} />
      <div className="note-form-row">
        <label className="note-remind">
          <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
          <Icon name="bell" size={15} />Remind me
        </label>
        {remind && <input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required aria-label="Remind at" />}
        <span className="note-form-actions">
          {onCancel && <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
          <button className="btn btn-primary btn-sm" disabled={busy || !body.trim()}>{submitLabel}</button>
        </span>
      </div>
      <ErrorNote error={err} />
    </form>
  );
}

const sort = (a, b) => a.done - b.done
  || (a.remindAt ? 0 : 1) - (b.remindAt ? 0 : 1)
  || (a.remindAt && b.remindAt ? a.remindAt.localeCompare(b.remindAt) : b.createdAt.localeCompare(a.createdAt));

/** Short notes for an entry; any of them can be a reminder that shows on the dashboard. */
export default function NotesModal({ entity, onClose, onCount }) {
  const r = useRecords(entity.id, 'notes', sort);
  const [editing, setEditing] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const open = r.list.filter((n) => !n.done);
  const done = r.list.filter((n) => n.done);

  const setDone = async (n, value) => {
    try {
      await r.update(n.id, { done: value });
      onCount?.(value ? -1 : 1);
    } catch (e) { toast(e.message, 'danger'); }
  };

  const item = (n) => (
    <li key={n.id} className={`note-item ${n.done ? 'is-done' : ''} ${isDue(n) ? 'is-due' : ''}`}>
      {editing === n.id ? (
        <NoteForm initial={n} submitLabel="Save" onCancel={() => setEditing(null)}
          onSave={async (b) => { await r.update(n.id, b); setEditing(null); }} />
      ) : (
        <div className="note-row">
          <button type="button" className={`task-check ${n.done ? 'is-done' : ''}`} onClick={() => setDone(n, !n.done)}
            role="checkbox" aria-checked={n.done} aria-label={n.done ? 'Mark note open' : 'Mark note done'}>
            {n.done && <Icon name="check" size={13} />}
          </button>
          <div className="note-main">
            <p className="prewrap">{n.body}</p>
            <ReminderChip note={n} />
          </div>
          <div className="task-actions is-shown">
            <button type="button" className="icon-btn" onClick={() => setEditing(n.id)} aria-label="Edit note" title="Edit"><Icon name="edit" size={16} /></button>
            <button type="button" className="icon-btn danger" aria-label="Delete note" title="Delete"
              onClick={async () => { if (await r.remove(n.id, 'this note') && !n.done) onCount?.(-1); }}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>
      )}
    </li>
  );

  return (
    <Modal title={`Notes · ${entity.title}`} onClose={onClose}>
      <NoteForm initial={{ body: '', remindAt: null }} submitLabel="Add note"
        onSave={async (b) => { await r.add(b); onCount?.(1); if (b.remindAt) toast('Reminder set'); }} />
      {r.loading && !r.data && <Loading />}
      <ErrorNote error={r.error} onRetry={r.reload} />
      {r.data && !r.list.length && <p className="empty">No notes yet. Reminders show on the dashboard when their time comes.</p>}
      {open.length > 0 && <ul className="notes">{open.map(item)}</ul>}
      {done.length > 0 && (
        <div className="done-group">
          <button type="button" className="done-toggle" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
            <Icon name="chevron" size={15} />Done ({done.length})
          </button>
          {showDone && <ul className="notes">{done.map(item)}</ul>}
        </div>
      )}
    </Modal>
  );
}

/** Marks a reminder done from the dashboard. */
export const dismissNote = (n) => w(`notes/${n.id}`, { method: 'PATCH', body: { done: true } });
