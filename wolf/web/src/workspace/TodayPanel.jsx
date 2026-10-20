import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { w } from '../api.js';
import { useAsync } from '../useAsync.js';
import { ErrorNote, Icon, Loading, toast } from '../ui.jsx';
import AgendaItem from './AgendaItem.jsx';
import MeetingModal from './MeetingModal.jsx';
import { dismissNote } from './Notes.jsx';
import { clock, localDate, shortDate, today } from './meta.js';

const replace = (list, e) => list.map((x) => (x.type === e.type && x.id === e.id && x.date === e.date ? e : x));

/**
 * The dashboard agenda, shared by the Today and Coming up columns.
 * Re-checks the clock every 30 s so reminders appear when their time comes, and reloads every 5 min.
 */
export function useAgenda() {
  const res = useAsync(() => w(`agenda?today=${today()}`), []);
  const [now, setNow] = useState(() => new Date());
  const [meeting, setMeeting] = useState(null); // { id } or { initial }
  const seen = useRef(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    const reload = setInterval(res.reload, 5 * 60_000);
    return () => { clearInterval(tick); clearInterval(reload); };
  }, [res.reload]);

  const reminders = res.data?.reminders || [];
  const due = reminders.filter((n) => new Date(n.remindAt) <= now);
  const laterToday = reminders.filter((n) => new Date(n.remindAt) > now && localDate(new Date(n.remindAt)) === today());
  const laterDays = reminders.filter((n) => localDate(new Date(n.remindAt)) > today());

  // Announce reminders that come due while the page is open (not the ones already due on load).
  useEffect(() => {
    if (!res.data) return;
    const ids = new Set(due.map((n) => n.id));
    if (seen.current) for (const n of due) if (!seen.current.has(n.id)) toast(`Reminder: ${n.body.slice(0, 80)}`, 'warn');
    seen.current = ids;
  }, [res.data, due.map((n) => n.id).join()]);

  const onChanged = (key) => (e) => res.setData((d) => ({ ...d, [key]: replace(d[key], e) }));
  const dismiss = async (n) => {
    res.setData((d) => ({ ...d, reminders: d.reminders.filter((x) => x.id !== n.id) }));
    try { await dismissNote(n); } catch (e) { toast(e.message, 'danger'); res.reload(); }
  };

  const modal = meeting && (
    <MeetingModal id={meeting.id} initial={meeting.initial} onClose={() => setMeeting(null)} onSaved={() => res.reload()} />
  );
  const openMeeting = (e) => setMeeting({ id: e.id });
  const scheduleMeeting = (initial) => setMeeting({ initial });

  return { res, a: res.data, due, laterToday, laterDays, onChanged, dismiss, modal, openMeeting, scheduleMeeting };
}

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function Reminder({ n, onDismiss, showDate }) {
  const at = new Date(n.remindAt);
  return (
    <li className="agenda-item type-reminder" style={{ '--biz': n.color }}>
      <button type="button" className="task-check" onClick={() => onDismiss(n)} role="checkbox" aria-checked={false} aria-label="Mark reminder done" />
      <Link to={`/w/${n.entityId}`} className="agenda-link">
        <span className="agenda-time">
          {showDate && <span className="agenda-date">{shortDate(localDate(at))}</span>}
          {clock(hhmm(at))}
        </span>
        <span className="agenda-main">
          <span className="agenda-title">{n.body}</span>
          <span className="agenda-sub">Reminder · {n.entityTitle}</span>
        </span>
      </Link>
    </li>
  );
}

export function TodayColumn({ ag, onTimeline }) {
  const { res, a, due, laterToday, onChanged, dismiss, openMeeting, scheduleMeeting } = ag;
  const heading = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <section className="panel dash-col" aria-label="Today">
      <div className="panel-head">
        <div>
          <h3>Today</h3>
          <p className="sub">{heading}</p>
        </div>
        <div className="panel-tools">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onTimeline()} title="Today hour by hour"><Icon name="clock" size={15} />Timeline</button>
          <Link to="/routine" className="icon-btn icon-btn-box" aria-label="Routine" title="Routine"><Icon name="repeat" size={16} /></Link>
        </div>
      </div>
      {res.loading && !a && <Loading />}
      <ErrorNote error={res.error} onRetry={res.reload} />
      {due.length > 0 && (
        <div className="reminders-due">
          <p className="agenda-group is-late"><Icon name="bell" size={13} />Reminders</p>
          <ul className="agenda">{due.map((n) => <Reminder key={n.id} n={n} onDismiss={dismiss} showDate={localDate(new Date(n.remindAt)) !== today()} />)}</ul>
        </div>
      )}
      {a && (a.todayItems.length || laterToday.length ? (
        <>
          {due.length > 0 && <p className="agenda-group">Schedule</p>}
          <ul className="agenda">
            {a.todayItems.map((e) => <AgendaItem key={`${e.type}${e.id}`} e={e} onChanged={onChanged('todayItems')} onOpen={openMeeting} />)}
            {laterToday.map((n) => <Reminder key={`r${n.id}`} n={n} onDismiss={dismiss} />)}
          </ul>
        </>
      ) : !due.length && (
        <p className="empty-text">Nothing scheduled today. Add repeating things like classes or tutoring in <Link to="/routine" className="link">Routine</Link>.</p>
      ))}
      <button type="button" className="btn btn-ghost btn-sm dash-col-cta" onClick={() => scheduleMeeting()}>
        <Icon name="users" size={15} />Schedule a meeting
      </button>
    </section>
  );
}

export function ComingUpColumn({ ag }) {
  const { a, laterDays, onChanged, dismiss, openMeeting } = ag;
  return (
    <section className="panel dash-col" aria-label="Coming up">
      <div className="panel-head">
        <h3>Coming up</h3>
        <Link to="/calendar" className="icon-btn icon-btn-box" aria-label="Calendar" title="Calendar"><Icon name="calendar" size={16} /></Link>
      </div>
      {a && (
        <>
          {a.overdue.length > 0 && (
            <>
              <p className="agenda-group is-late">Overdue</p>
              <ul className="agenda">{a.overdue.map((e) => <AgendaItem key={`o${e.type}${e.id}`} e={e} showDate onChanged={onChanged('overdue')} />)}</ul>
            </>
          )}
          {a.upcoming.length > 0 ? (
            <>
              {a.overdue.length > 0 && <p className="agenda-group">Next 7 days</p>}
              <ul className="agenda">{a.upcoming.map((e) => <AgendaItem key={`u${e.type}${e.id}`} e={e} showDate onChanged={onChanged('upcoming')} onOpen={openMeeting} />)}</ul>
            </>
          ) : !a.overdue.length && !laterDays.length && <p className="empty-text">No deadlines in the next 7 days.</p>}
          {laterDays.length > 0 && (
            <>
              <p className="agenda-group"><Icon name="bell" size={13} />Reminders</p>
              <ul className="agenda">{laterDays.map((n) => <Reminder key={n.id} n={n} onDismiss={dismiss} showDate />)}</ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
