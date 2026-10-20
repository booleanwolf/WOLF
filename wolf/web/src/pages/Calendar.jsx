import { useState } from 'react';
import { w } from '../api.js';
import { useAsync } from '../useAsync.js';
import { ErrorNote, Icon } from '../ui.jsx';
import AgendaItem from '../workspace/AgendaItem.jsx';
import { useDayTimeline } from '../workspace/DayView.jsx';
import MeetingModal from '../workspace/MeetingModal.jsx';
import { WEEKDAYS_SHORT, WEEK_START, addDays, clock, localDate, today, weekOrder, weekdayOf } from '../workspace/meta.js';

// Groups that can be hidden; routine and classes fill the month quickly.
const LAYERS = {
  deadlines: { label: 'Deadlines & tasks', types: ['task', 'subtask', 'deadline'] },
  cts: { label: 'CTs', types: ['ct'] },
  meetings: { label: 'Meetings', types: ['meeting'] },
  contests: { label: 'Contests', types: ['contest'] },
  routine: { label: 'Routine', types: ['routine'] },
  classes: { label: 'Classes & labs', types: ['class', 'lab'] },
};
const LAYER_KEY = 'wolf-calendar-layers';
const RANK = { deadline: 0, ct: 1, meeting: 1, contest: 1, task: 2, subtask: 2, class: 3, lab: 3, routine: 4 };

function readLayers() {
  try {
    const v = JSON.parse(localStorage.getItem(LAYER_KEY));
    if (v && typeof v === 'object') return { ...Object.fromEntries(Object.keys(LAYERS).map((k) => [k, true])), ...v };
  } catch {}
  return Object.fromEntries(Object.keys(LAYERS).map((k) => [k, true]));
}

/** First and last day shown for a month: whole weeks, starting on WEEK_START. */
function monthGrid(year, month) {
  const first = localDate(new Date(year, month, 1));
  const start = addDays(first, -((weekdayOf(first) - WEEK_START + 7) % 7));
  const last = localDate(new Date(year, month + 1, 0));
  const end = addDays(last, (WEEK_START + 6 - weekdayOf(last) + 7) % 7);
  return { start, end };
}

export default function Calendar() {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState(today());
  const [layers, setLayers] = useState(readLayers);
  const [meeting, setMeeting] = useState(null); // { id } or { initial }
  const { start, end } = monthGrid(ym.y, ym.m);
  const res = useAsync(() => w(`calendar?from=${start}&to=${end}`), [start, end]);
  const day = useDayTimeline(res.reload);

  const visibleTypes = new Set(Object.entries(LAYERS).filter(([k]) => layers[k]).flatMap(([, l]) => l.types));
  const events = (res.data || []).filter((e) => visibleTypes.has(e.type));
  const byDay = {};
  for (const e of events) (byDay[e.date] ||= []).push(e);
  // Day cells only fit a few items, so deadlines and CTs go before routine and classes there.
  const cellList = (d) => [...(byDay[d] || [])].sort((a, b) => (RANK[a.type] ?? 9) - (RANK[b.type] ?? 9));

  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const monthPrefix = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}`;
  const title = new Date(ym.y, ym.m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const shift = (n) => {
    const d = new Date(ym.y, ym.m + n, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
    // Keep the day panel inside the month on screen.
    setSelected(d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() ? today() : localDate(d));
  };
  const goToday = () => { setYm({ y: now.getFullYear(), m: now.getMonth() }); setSelected(today()); };
  const toggleLayer = (k) => {
    const next = { ...layers, [k]: !layers[k] };
    setLayers(next);
    try { localStorage.setItem(LAYER_KEY, JSON.stringify(next)); } catch {}
  };
  // Picking a day shows its list here and opens its hour-by-hour timeline.
  const pickDay = (d) => {
    setSelected(d);
    day.open(d);
  };
  const onChanged = (e) => res.setData((list) => list.map((x) => (x.type === e.type && x.id === e.id && x.date === e.date ? e : x)));

  const dayEvents = byDay[selected] || [];
  const selectedLabel = new Date(`${selected}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Calendar</h1>
          <p className="muted">Deadlines, CTs, meetings, routine and classes in one view.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setMeeting({ initial: { date: selected } })}><Icon name="users" size={15} />Schedule a meeting</button>
      </div>

      <div className="cal-bar">
        <div className="week-nav">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month"><Icon name="back" size={17} /></button>
          <h2 className="cal-title">{title}</h2>
          <button className="icon-btn flip" onClick={() => shift(1)} aria-label="Next month"><Icon name="back" size={17} /></button>
          <button className="btn btn-ghost btn-sm" onClick={goToday}>Today</button>
        </div>
        <div className="chips-filter" role="group" aria-label="Show on calendar">
          {Object.entries(LAYERS).map(([k, l]) => (
            <button key={k} type="button" className={layers[k] ? 'is-on' : ''} aria-pressed={layers[k]} onClick={() => toggleLayer(k)}>{l.label}</button>
          ))}
        </div>
      </div>

      <ErrorNote error={res.error} onRetry={res.reload} />

      <div className="cal-layout">
        <div className={`cal ${res.loading ? 'is-loading' : ''}`}>
          <div className="cal-head" aria-hidden="true">
            {weekOrder().map((d) => <span key={d}>{WEEKDAYS_SHORT[d]}</span>)}
          </div>
          <div className="cal-grid" role="grid" aria-label={title}>
            {days.map((d) => {
              const list = cellList(d);
              const inMonth = d.startsWith(monthPrefix);
              return (
                <button key={d} type="button" role="gridcell"
                  className={`cal-day ${inMonth ? '' : 'is-out'} ${d === today() ? 'is-today' : ''} ${d === selected ? 'is-selected' : ''}`}
                  onClick={() => pickDay(d)} aria-selected={d === selected}
                  aria-label={`${new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, ${list.length} item${list.length === 1 ? '' : 's'}`}>
                  <span className="cal-num">{Number(d.slice(8))}</span>
                  <span className="cal-events" aria-hidden="true">
                    {list.slice(0, 3).map((e) => (
                      <span key={`${e.type}${e.id}`} className={`cal-ev type-${e.type} ${e.done ? 'is-done' : ''}`} style={{ '--biz': e.color }}>
                        {e.time && <span className="cal-ev-time">{clock(e.time)}</span>}{e.title}
                      </span>
                    ))}
                    {list.length > 3 && <span className="cal-more">+{list.length - 3} more</span>}
                  </span>
                  {list.length > 0 && (
                    <span className="cal-dots" aria-hidden="true">
                      {list.slice(0, 4).map((e) => <span key={`${e.type}${e.id}`} style={{ '--biz': e.color }} />)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="panel cal-agenda">
          <div className="cal-agenda-head">
            <h3>{selected === today() ? `Today, ${selectedLabel.split(' ').slice(1).join(' ')}` : selectedLabel}</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => day.open(selected)}><Icon name="clock" size={15} />Timeline</button>
          </div>
          {dayEvents.length
            ? <ul className="agenda">{dayEvents.map((e) => <AgendaItem key={`${e.type}${e.id}`} e={e} onChanged={onChanged} onOpen={(m) => setMeeting({ id: m.id })} />)}</ul>
            : <p className="empty">Nothing on this day.</p>}
        </aside>
      </div>
      {day.modal}
      {meeting && <MeetingModal id={meeting.id} initial={meeting.initial} onClose={() => setMeeting(null)} onSaved={() => res.reload()} />}
    </div>
  );
}
