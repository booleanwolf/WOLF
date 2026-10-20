import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../ui.jsx';
import AgendaItem from './AgendaItem.jsx';
import { EVENT_TYPE, clock, today } from './meta.js';
import { MIN_PX, duration, freeOn, layout, nowMinutes, readHours, saveHours, shownRange, span, toTime } from './timeline.js';

/**
 * One timed item on a timeline. Meetings and routine open their dialogs (onOpen / onRoutine);
 * everything else links to its entry.
 */
export function Block({ b, from, onOpen, onRoutine, compact }) {
  const { e } = b;
  const t = EVENT_TYPE[e.type];
  const height = Math.max((b.end - b.start) * MIN_PX, 22);
  const style = {
    '--biz': e.color,
    top: (b.start - from) * MIN_PX,
    height,
    left: `calc(${(b.col / b.cols) * 100}% + 2px)`,
    width: `calc(${100 / b.cols}% - 4px)`,
  };
  const when = b.guessed ? clock(e.time) : span(b.start, b.end);
  const label = `${t.label}: ${e.title}, ${b.guessed ? `from ${clock(e.time)}` : when}${e.changed ? ', changed for this day' : ''}`;
  const body = (
    <>
      <span className="tl-ev-title">
        {e.type === 'routine' && e.done && <Icon name="check" size={12} />}
        {e.title}
      </span>
      <span className="tl-ev-sub">
        {when}
        {!compact && height >= 40 && ` · ${[t.label, e.location].filter(Boolean).join(' · ')}`}
        {e.changed && <span className="tl-changed" title={`Usually ${clock(e.usualTime) || 'no set time'}`}> · moved</span>}
      </span>
    </>
  );
  const cls = `tl-ev type-${e.type} ${e.done ? 'is-done' : ''} ${b.guessed ? 'is-guessed' : ''} ${height < 40 ? 'is-short' : ''}`;
  const open = e.type === 'meeting' ? onOpen : e.type === 'routine' ? onRoutine : null;
  if (open) return <button type="button" className={cls} style={style} onClick={() => open(e)} aria-label={label}>{body}</button>;
  const to = e.type === 'contest' ? '/cp?tab=contests' : e.entityId ? `/w/${e.entityId}` : null;
  return to
    ? <Link to={to} className={cls} style={style} aria-label={label}>{body}</Link>
    : <div className={cls} style={style} aria-label={label}>{body}</div>;
}

/** "Awake 8 am – 11 pm" with pickers; free time only counts inside these hours. */
export function HoursSetting({ hours, onChange }) {
  const [open, setOpen] = useState(false);
  const options = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
    .map((h) => <option key={h} value={h}>{clock(toTime(h * 60))}</option>);
  const set = (next) => { saveHours(next); onChange(next); };
  return (
    <>
      <button type="button" className="btn-text tl-hours-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="clock" size={13} />Awake {clock(toTime(hours.from * 60))} – {clock(toTime(hours.to * 60))}
      </button>
      {open && (
        <div className="tl-hours">
          <label>From
            <select className="input select" value={hours.from} onChange={(e) => set({ ...hours, from: Math.min(Number(e.target.value), hours.to - 1) })}>
              {options(0, 22)}
            </select>
          </label>
          <label>To
            <select className="input select" value={hours.to} onChange={(e) => set({ ...hours, to: Math.max(Number(e.target.value), hours.from + 1) })}>
              {options(1, 24)}
            </select>
          </label>
        </div>
      )}
    </>
  );
}

/** Minute clock that ticks while the date shown is today. */
export function useNow(active) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/**
 * One day, hour by hour: timed items as blocks, free stretches between them, and the items that
 * have no time (deadlines, tasks due) listed above. Free time counts only the waking hours.
 */
export default function DayTimeline({ date, events, onChanged, onOpen, onRoutine }) {
  const [hours, setHours] = useState(readHours);
  const scroller = useRef(null);
  const isToday = date === today();
  const nowMin = nowMinutes(useNow(isToday));

  const blocks = layout(events);
  const untimed = events.filter((e) => !e.time && !e.skipped);
  const skipped = events.filter((e) => e.skipped);
  const isPast = date < today();
  const free = freeOn(date, blocks, hours, today(), nowMin);
  const freeTotal = free.reduce((n, [s, e]) => n + e - s, 0);
  const range = shownRange(blocks, hours);
  const wake = { from: hours.from * 60, to: hours.to * 60 };
  const hourMarks = [];
  for (let m = range.from; m < range.to; m += 60) hourMarks.push(m);

  // Open at the current time today, else at the first item (or the start of the day).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = isToday ? nowMin - 60 : (blocks[0]?.start ?? wake.from) - 30;
    el.scrollTop = Math.max(0, (target - range.from) * MIN_PX);
  }, [date, blocks.length > 0]);

  return (
    <div className="tl">
      <div className="tl-summary">
        {isPast ? (
          <p className="sub">This day is over.</p>
        ) : (
          <>
            <p className="tl-free-total">
              <span className="strong">{freeTotal ? `${duration(freeTotal)} free` : 'No free time'}</span>
              <span className="sub"> {isToday ? 'left today' : 'this day'}</span>
            </p>
            {free.length > 0 && (
              <ul className="tl-free-list" aria-label="Free periods">
                {free.map(([s, e]) => <li key={s}>{span(s, e)}</li>)}
              </ul>
            )}
          </>
        )}
        <HoursSetting hours={hours} onChange={setHours} />
      </div>

      {untimed.length > 0 && (
        <div className="tl-allday">
          <p className="agenda-group">Any time</p>
          <ul className="agenda is-compact">
            {untimed.map((e) => <AgendaItem key={`${e.type}${e.id}`} e={e} onChanged={onChanged} onOpen={onOpen} />)}
          </ul>
        </div>
      )}

      {skipped.length > 0 && (
        <p className="tl-skipped">
          <span className="sub">Skipped this day:</span>
          {skipped.map((e) => (
            <button key={e.id} type="button" className="chip chip-btn" onClick={() => onRoutine?.(e)} style={{ '--biz': e.color }}>{e.title}</button>
          ))}
        </p>
      )}

      <div className="tl-scroll" ref={scroller}>
        <div className="tl-grid" style={{ height: (range.to - range.from) * MIN_PX }}>
          {hourMarks.map((m) => (
            <div key={m} className="tl-hour" style={{ top: (m - range.from) * MIN_PX }}><span>{clock(toTime(m))}</span></div>
          ))}
          <div className="tl-lane">
            {range.from < wake.from && <div className="tl-asleep" style={{ top: 0, height: (wake.from - range.from) * MIN_PX }} />}
            {isToday && nowMin > range.from && <div className="tl-past" style={{ top: 0, height: (Math.min(nowMin, range.to) - range.from) * MIN_PX }} />}
            {range.to > wake.to && <div className="tl-asleep" style={{ top: (wake.to - range.from) * MIN_PX, height: (range.to - wake.to) * MIN_PX }} />}
            {free.map(([s, e]) => (
              <div key={`f${s}`} className="tl-free" style={{ top: (s - range.from) * MIN_PX, height: (e - s) * MIN_PX }}>
                {(e - s) * MIN_PX >= 22 && <span>Free · {duration(e - s)}</span>}
              </div>
            ))}
            {blocks.map((b) => <Block key={`${b.e.type}${b.e.id}`} b={b} from={range.from} onOpen={onOpen} onRoutine={onRoutine} />)}
            {isToday && nowMin >= range.from && nowMin <= range.to && (
              <div className="tl-now" style={{ top: (nowMin - range.from) * MIN_PX }} aria-label={`Now, ${clock(toTime(nowMin))}`} />
            )}
          </div>
        </div>
      </div>
      {!blocks.length && <p className="sub tl-empty">No timed items on this day.</p>}
    </div>
  );
}
