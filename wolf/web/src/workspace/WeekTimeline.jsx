import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../ui.jsx';
import { Block, HoursSetting, useNow } from './DayTimeline.jsx';
import { WEEKDAYS_SHORT, clock, shortDate, today, weekdayOf } from './meta.js';
import { HOUR_PX, MIN_PX, duration, freeOn, layout, nowMinutes, readHours, shownRange, toMin, toTime } from './timeline.js';

/**
 * A week hour by hour: routine, classes, meetings and contests as blocks in seven day columns,
 * with each day's free time. Routine blocks open onRoutine (tick, move or skip that day);
 * a day's heading opens onDay (its own timeline).
 */
export default function WeekTimeline({ days, events, onRoutine, onOpen, onDay }) {
  const [hours, setHours] = useState(readHours);
  const scroller = useRef(null);
  const nowMin = nowMinutes(useNow(days.includes(today())));

  const perDay = days.map((d) => {
    const list = events.filter((e) => e.date === d);
    const blocks = layout(list);
    const free = freeOn(d, blocks, hours, today(), nowMin);
    // Skipped routine stays visible as an outline at its usual time, so it can be brought back.
    const skipped = list.filter((e) => e.skipped && e.usualTime).map((e) => {
      const start = toMin(e.usualTime);
      return { e, start, end: e.usualEndTime ? toMin(e.usualEndTime) : start + 60 };
    });
    return { d, blocks, free, skipped };
  });
  const range = shownRange(perDay.flatMap((x) => x.blocks), hours);
  const wake = { from: hours.from * 60, to: hours.to * 60 };
  const hourMarks = [];
  for (let m = range.from; m < range.to; m += 60) hourMarks.push(m);

  // Start at the waking hours, and on a narrow screen slide across to today.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = Math.max(0, (wake.from - range.from - 30) * MIN_PX);
    const head = el.querySelector('.wk-head.is-today');
    el.scrollLeft = head ? Math.max(0, head.offsetLeft - 50) : 0;
  }, [days[0]]);

  const height = (range.to - range.from) * MIN_PX;
  return (
    <div className="wk">
      <div className="wk-tools">
        <span className="sub"><span className="wk-key" aria-hidden="true" />Free time</span>
        <HoursSetting hours={hours} onChange={setHours} />
      </div>
      <div className="wk-scroll" ref={scroller}>
        <div className="wk-grid" style={{ '--hour': `${HOUR_PX}px` }}>
          <div className="wk-corner" />
          {perDay.map(({ d, free }) => {
            const total = free.reduce((n, [s, e]) => n + e - s, 0);
            return (
              <button key={d} type="button" className={`wk-head ${d === today() ? 'is-today' : ''}`} onClick={() => onDay(d)}
                title="Open this day's timeline">
                <span className="strong">{WEEKDAYS_SHORT[weekdayOf(d)]} <span className="tnum">{shortDate(d)}</span></span>
                <span className="wk-free">{d < today() ? 'Over' : total ? `${duration(total)} free` : 'No free time'}</span>
              </button>
            );
          })}

          <div className="wk-gutter" style={{ height }}>
            {hourMarks.map((m) => <span key={m} style={{ top: (m - range.from) * MIN_PX }}>{clock(toTime(m))}</span>)}
          </div>
          {perDay.map(({ d, blocks, free, skipped }) => (
            <div key={d} className={`wk-col ${d === today() ? 'is-today' : ''}`} style={{ height }}>
              {range.from < wake.from && <div className="tl-asleep" style={{ top: 0, height: (wake.from - range.from) * MIN_PX }} />}
              {range.to > wake.to && <div className="tl-asleep" style={{ top: (wake.to - range.from) * MIN_PX, height: (range.to - wake.to) * MIN_PX }} />}
              {free.map(([s, e]) => (
                <div key={`f${s}`} className="tl-free wk-free-block" style={{ top: (s - range.from) * MIN_PX, height: (e - s) * MIN_PX }}
                  title={`Free ${clock(toTime(s))} – ${clock(toTime(e))}`}>
                  {(e - s) * MIN_PX >= 40 && <span>{duration(e - s)}</span>}
                </div>
              ))}
              {skipped.map((b) => (
                <button key={`s${b.e.id}`} type="button" className="wk-skipped" style={{ '--biz': b.e.color, top: (b.start - range.from) * MIN_PX, height: Math.max((b.end - b.start) * MIN_PX, 22) }}
                  onClick={() => onRoutine(b.e)} aria-label={`${b.e.title} skipped this day. Open to bring it back.`}>
                  <Icon name="x" size={11} />{b.e.title}
                </button>
              ))}
              {blocks.map((b) => <Block key={`${b.e.type}${b.e.id}`} b={b} from={range.from} onOpen={onOpen} onRoutine={onRoutine} compact />)}
              {d === today() && nowMin >= range.from && nowMin <= range.to && <div className="tl-now" style={{ top: (nowMin - range.from) * MIN_PX }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
