import { Link } from 'react-router-dom';
import { w } from '../api.js';
import { Icon, toast } from '../ui.jsx';
import { EVENT_TYPE, clock, shortDate } from './meta.js';

// Routine days and tasks can be ticked off right from the agenda.
export const canCheck = (e) => e.type === 'routine' || e.type === 'task' || e.type === 'subtask';

/**
 * Ticks an item from the agenda and returns the fields that changed. A task that needs several
 * ticks gets one more each time; a finished one is reset.
 */
export async function toggleEvent(e) {
  if (e.type === 'routine') {
    await w(`routines/${e.id}/checks/${e.date}`, { method: 'PUT', body: { done: !e.done } });
    return { done: !e.done };
  }
  if (e.reps > 1) {
    const t = await w(`tasks/${e.id}`, { method: 'PATCH', body: { repsDone: e.done ? 0 : (e.repsDone || 0) + 1 } });
    return { done: t.done, repsDone: t.repsDone };
  }
  await w(`tasks/${e.id}`, { method: 'PATCH', body: { done: !e.done } });
  return { done: !e.done };
}

/** onOpen(e) is called for meetings, which open in a dialog instead of linking to their entry. */
export default function AgendaItem({ e, showDate, onChanged, onOpen }) {
  const t = EVENT_TYPE[e.type];
  const toggle = async () => {
    try {
      onChanged?.({ ...e, ...(await toggleEvent(e)) });
    } catch (err) {
      toast(err.message, 'danger');
    }
  };
  const sub = [
    t.label,
    e.reps > 1 ? `${e.repsDone || 0}/${e.reps} ticks` : null,
    e.type === 'subtask' && e.parentTitle ? `in ${e.parentTitle}` : null,
    e.type !== 'class' && e.type !== 'lab' && e.type !== 'deadline' && e.entityTitle ? e.entityTitle : null,
    e.location || null,
    e.type === 'ct' && e.marks != null ? `${e.marks}/${e.total}` : null,
  ].filter(Boolean).join(' · ');

  const body = (
    <>
      <span className="agenda-time">
        {showDate && <span className="agenda-date">{shortDate(e.date)}</span>}
        {e.time ? clock(e.time) : !showDate && <span className="muted">All day</span>}
      </span>
      <span className="agenda-main">
        <span className="agenda-title">{e.title}</span>
        <span className="agenda-sub">{sub}</span>
      </span>
    </>
  );

  return (
    <li className={`agenda-item type-${e.type} ${e.done ? 'is-done' : ''}`} style={{ '--biz': e.color }}>
      {canCheck(e) ? (
        <button type="button" className={`task-check ${e.done ? 'is-done' : ''}`} onClick={toggle}
          role="checkbox" aria-checked={Boolean(e.done)}
          aria-label={e.reps > 1 && !e.done ? `Tick "${e.title}" once more (${e.repsDone || 0} of ${e.reps})` : `Mark "${e.title}" ${e.done ? 'not done' : 'done'}`}>
          {e.done && <Icon name="check" size={13} />}
        </button>
      ) : (
        <span className="agenda-icon" aria-hidden="true"><Icon name={t.icon} size={14} /></span>
      )}
      {e.type === 'meeting' && onOpen
        ? <button type="button" className="agenda-link" onClick={() => onOpen(e)}>{body}</button>
        : e.type === 'contest' ? <Link to="/cp?tab=contests" className="agenda-link">{body}</Link>
        : e.entityId ? <Link to={`/w/${e.entityId}`} className="agenda-link">{body}</Link> : <span className="agenda-link">{body}</span>}
    </li>
  );
}
