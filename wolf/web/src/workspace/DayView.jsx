import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { w } from '../api.js';
import { IN_APP } from '../Shell.jsx';
import { useAsync } from '../useAsync.js';
import { ErrorNote, Icon, Loading, Modal } from '../ui.jsx';
import DayTimeline from './DayTimeline.jsx';
import MeetingModal from './MeetingModal.jsx';
import RoutineDayModal from './RoutineDayModal.jsx';
import { addDays, today } from './meta.js';

const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
export const dayTitle = (d) => (d === today() ? 'Today' : new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' }));
const daySub = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** A day's timeline with its own data, day-to-day arrows and the dialogs its blocks open. */
function DayView({ date, setDate, onChanged }) {
  const res = useAsync(() => w(`calendar?from=${date}&to=${date}&skipped=1`), [date]);
  const [meeting, setMeeting] = useState(null);
  const [routine, setRoutine] = useState(null);
  const changed = () => { res.reload(); onChanged?.(); };
  const replace = (e) => {
    res.setData((list) => list.map((x) => (x.type === e.type && x.id === e.id && x.date === e.date ? e : x)));
    onChanged?.();
  };

  return (
    <div className="day-view">
      <div className="day-nav">
        <button type="button" className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><Icon name="back" size={17} /></button>
        <div className="day-nav-title">
          <span className="strong">{dayTitle(date)}</span>
          <span className="sub">{daySub(date)}</span>
        </div>
        <button type="button" className="icon-btn flip" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><Icon name="back" size={17} /></button>
        {date !== today() && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDate(today())}>Today</button>}
      </div>
      <ErrorNote error={res.error} onRetry={res.reload} />
      {res.data
        ? <DayTimeline date={date} events={res.data} onChanged={replace} onOpen={(m) => setMeeting(m.id)} onRoutine={setRoutine} />
        : !res.error && <Loading />}
      {meeting && <MeetingModal id={meeting} onClose={() => setMeeting(null)} onSaved={changed} />}
      {routine && <RoutineDayModal e={routine} onClose={() => setRoutine(null)} onSaved={changed} />}
    </div>
  );
}

/** The day timeline in a dialog (the web app). */
export function DayModal({ date: initial, onClose, onChanged }) {
  const [date, setDate] = useState(initial);
  return (
    <Modal title="Day timeline" onClose={onClose} wide>
      <DayView date={date} setDate={setDate} onChanged={onChanged} />
    </Modal>
  );
}

/** The day timeline as its own page (/day/2026-10-07), used by the Android app. */
export function DayPage() {
  const { date } = useParams();
  const navigate = useNavigate();
  const d = isDate(date) ? date : today();
  return (
    <div className="stack day-page">
      <Link to="/" className="back"><Icon name="back" size={16} />Dashboard</Link>
      <DayView date={d} setDate={(next) => navigate(`/day/${next}`, { replace: true })} />
    </div>
  );
}

/**
 * Opens a day's timeline: a dialog on the web, its own page in the app.
 * Render `modal` somewhere in the page; onChanged runs when something changes in the dialog.
 */
export function useDayTimeline(onChanged) {
  const [date, setDate] = useState(null);
  const navigate = useNavigate();
  const open = (d = today()) => (IN_APP ? navigate(`/day/${d}`) : setDate(d));
  const modal = date && <DayModal date={date} onClose={() => setDate(null)} onChanged={onChanged} />;
  return { open, modal };
}
