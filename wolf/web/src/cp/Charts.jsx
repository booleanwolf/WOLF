// Charts for the CP page. All single-series, so they use one hue (the app accent) and need no legend;
// every mark has a hover tooltip, and each chart has a text summary for screen readers.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { WEEK_START, addDays, shortDate, weekdayOf } from '../workspace/meta.js';
import { cfRank } from './meta.js';

/* ---------- Tooltip ---------- */

/** A tooltip that follows the pointer inside a relatively positioned chart box. */
function useTip() {
  const box = useRef(null);
  const [tip, setTip] = useState(null);
  const show = (e, content) => {
    const r = box.current.getBoundingClientRect();
    const x = (e.clientX ?? r.left + r.width / 2) - r.left;
    const y = (e.clientY ?? r.top) - r.top;
    setTip({ x, y, content, flip: x > r.width - 180 });
  };
  const hide = () => setTip(null);
  const node = tip && (
    <div className={`viz-tip ${tip.flip ? 'is-flip' : ''}`} style={{ left: tip.x, top: tip.y }} role="status">{tip.content}</div>
  );
  return { box, show, hide, node };
}

function useWidth(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/* ---------- Practice heatmap ---------- */

const level = (n) => (n <= 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4);

/** A year of solved-per-day, one column per week, like a contribution graph. */
export function Heatmap({ days, today }) {
  const t = useTip();
  const scroller = useRef(null);
  const end = today;
  const start = addDays(end, -(52 * 7) - ((weekdayOf(end) - WEEK_START + 7) % 7));
  const cells = [];
  for (let d = start; d <= end; d = addDays(d, 1)) cells.push(d);
  const weeks = Math.ceil(cells.length / 7);
  const months = [];
  for (let wk = 0; wk < weeks; wk++) {
    const first = cells[wk * 7];
    const prev = wk ? cells[(wk - 1) * 7] : null;
    if (!prev || first.slice(5, 7) !== prev.slice(5, 7)) {
      months.push({ wk, label: new Date(`${first}T00:00:00`).toLocaleDateString('en-GB', { month: 'short' }) });
    }
  }
  const total = cells.reduce((s, d) => s + (days[d] || 0), 0);
  const active = cells.filter((d) => days[d]).length;
  // Start scrolled to today on narrow screens.
  useEffect(() => { const s = scroller.current; if (s) s.scrollLeft = s.scrollWidth; }, []);

  return (
    <div className="viz heat" ref={t.box}>
      <p className="sr-only">{total} problems solved over the last year, on {active} different days.</p>
      <div className="heat-scroll" ref={scroller}>
        <div className="heat-inner" style={{ '--weeks': weeks }}>
          <div className="heat-months" aria-hidden="true">
            {months.map((m) => <span key={m.wk} style={{ gridColumn: m.wk + 1 }}>{m.label}</span>)}
          </div>
          <div className="heat-grid" onMouseLeave={t.hide}>
            {cells.map((d) => {
              const n = days[d] || 0;
              return (
                <span key={d} className={`heat-cell l${level(n)} ${d === today ? 'is-today' : ''}`}
                  onMouseEnter={(e) => t.show(e, <><strong>{n} solved</strong><span>{shortDate(d)}</span></>)}
                  onMouseMove={(e) => t.show(e, <><strong>{n} solved</strong><span>{shortDate(d)}</span></>)} />
              );
            })}
          </div>
        </div>
      </div>
      <div className="heat-foot">
        <span className="sub">{total} solved in the last year · {active} active days</span>
        <span className="heat-legend" aria-hidden="true">
          Less {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`heat-cell l${l}`} />)} More
        </span>
      </div>
      {t.node}
    </div>
  );
}

/* ---------- Tags ---------- */

/** Horizontal bars of solved problems per tag. onPick(tag) filters the problem list. */
export function TagBars({ items, total, onPick }) {
  const t = useTip();
  const max = Math.max(1, ...items.map((i) => i.count));
  if (!items.length) return <p className="empty-text">Tags appear once you log solved problems.</p>;
  return (
    <div className="viz" ref={t.box} onMouseLeave={t.hide}>
      <ul className="bars">
        {items.map((i) => {
          const content = <><strong>{i.tag}</strong><span>{i.count} solved · {Math.round((i.count / Math.max(total, 1)) * 100)}% of solved</span></>;
          return (
            <li key={i.tag}>
              <button type="button" className="bar-row" onClick={() => onPick?.(i.tag)}
                onMouseEnter={(e) => t.show(e, content)} onMouseMove={(e) => t.show(e, content)} onFocus={(e) => t.show(e, content)} onBlur={t.hide}
                aria-label={`${i.tag}: ${i.count} solved. Show these problems`}>
                <span className="bar-label">{i.tag}</span>
                <span className="bar-track"><span className="bar-fill" style={{ width: `${(i.count / max) * 100}%` }} /></span>
                <span className="bar-value tnum">{i.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {t.node}
    </div>
  );
}

/* ---------- Rating distribution ---------- */

/** Solved problems per 100 rating points, as columns. */
export function RatingColumns({ items }) {
  const t = useTip();
  if (!items.length) return <p className="empty-text">Add ratings to problems (Codeforces import does it for you) to see this.</p>;
  const lo = items[0].rating;
  const hi = items[items.length - 1].rating;
  const byR = Object.fromEntries(items.map((i) => [i.rating, i.count]));
  const buckets = [];
  for (let r = lo; r <= hi; r += 100) buckets.push({ rating: r, count: byR[r] || 0 });
  const max = Math.max(...buckets.map((b) => b.count));
  const every = buckets.length > 16 ? 4 : buckets.length > 8 ? 2 : 1;
  return (
    <div className="viz" ref={t.box} onMouseLeave={t.hide}>
      <p className="sr-only">{buckets.filter((b) => b.count).map((b) => `${b.rating}: ${b.count}`).join(', ')}</p>
      <div className="cols" aria-hidden="true">
        {buckets.map((b, i) => {
          const content = <><strong>{b.count} solved</strong><span>rated {b.rating}</span></>;
          return (
            <div key={b.rating} className="col" onMouseEnter={(e) => t.show(e, content)} onMouseMove={(e) => t.show(e, content)}>
              <span className="col-bar" style={{ height: `${(b.count / max) * 100}%` }} />
              <span className="col-label">{i % every === 0 ? b.rating : ''}</span>
            </div>
          );
        })}
      </div>
      {t.node}
    </div>
  );
}

/* ---------- Rating over time ---------- */

const niceStep = (range) => [50, 100, 200, 250, 500, 1000].find((s) => range / s <= 5) || 1000;

/** One platform's rating after each rated contest. Crosshair and tooltip follow the nearest contest. */
export function RatingLine({ points, platform }) {
  if (!points.length) return <p className="empty-text">Rated contests will draw your rating here.</p>;
  return <RatingPlot points={points} platform={platform} />;
}

function RatingPlot({ points, platform }) {
  const t = useTip();
  const wrap = useRef(null);
  const width = useWidth(wrap);
  const [hover, setHover] = useState(null);

  const H = 220;
  const pad = { l: 44, r: 52, t: 12, b: 26 };
  const W = Math.max(width, 280);
  const times = points.map((p) => Date.parse(`${p.date}T00:00:00Z`));
  const t0 = times[0];
  const t1 = times[times.length - 1] === t0 ? t0 + 86400000 : times[times.length - 1];
  const ys = points.map((p) => p.rating);
  const step = niceStep(Math.max(...ys) - Math.min(...ys) || 100);
  const y0 = Math.floor(Math.min(...ys) / step) * step;
  const y1 = Math.ceil(Math.max(...ys) / step) * step + (Math.max(...ys) % step === 0 ? step : 0);
  const x = (tm) => pad.l + ((tm - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b);
  const grid = [];
  for (let v = y0; v <= y1; v += step) grid.push(v);
  // Year ticks, thinned so labels stay at least ~44px apart on narrow screens.
  const allYears = [];
  for (let yr = new Date(t0).getUTCFullYear() + 1; yr <= new Date(t1).getUTCFullYear(); yr++) allYears.push(yr);
  const yearGap = allYears.length > 1 ? x(Date.UTC(allYears[1], 0, 1)) - x(Date.UTC(allYears[0], 0, 1)) : Infinity;
  const every = Math.max(1, Math.ceil(44 / yearGap));
  const years = allYears.filter((yr) => (yr - allYears[0]) % every === 0);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(p.rating).toFixed(1)}`).join('');
  const last = points.length - 1;

  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(times[i]) - mx) < Math.abs(x(times[best]) - mx)) best = i;
    setHover(best);
    const p = points[best];
    const rank = platform === 'codeforces' ? cfRank(p.rating) : null;
    t.show({ clientX: r.left + x(times[best]), clientY: r.top + y(p.rating) }, (
      <>
        <strong className="tnum">{p.rating}{p.change != null && <span className="viz-tip-change"> ({p.change >= 0 ? '+' : ''}{p.change})</span>}</strong>
        {rank && <span><i className="rank-dot" style={{ background: rank.dot }} />{rank.name}</span>}
        <span>{p.name}</span>
        <span>{shortDate(p.date)}{p.rank ? ` · rank ${p.rank}` : ''}</span>
      </>
    ));
  };

  return (
    <div className="viz" ref={t.box}>
      <p className="sr-only">Rating went from {points[0].rating} to {points[last].rating} over {points.length} rated contests; best {Math.max(...ys)}.</p>
      <div ref={wrap} className="line-wrap">
        {width > 0 && (
          <svg width={W} height={H} role="img" aria-hidden="true" onMouseMove={move} onMouseLeave={() => { setHover(null); t.hide(); }}>
            {grid.map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="viz-grid" />
                <text x={pad.l - 8} y={y(v)} className="viz-axis" textAnchor="end" dominantBaseline="middle">{v}</text>
              </g>
            ))}
            {years.map((yr) => {
              const xx = x(Date.UTC(yr, 0, 1));
              return <text key={yr} x={xx} y={H - 6} className="viz-axis" textAnchor="middle">{yr}</text>;
            })}
            {!years.length && <text x={pad.l} y={H - 6} className="viz-axis">{shortDate(points[0].date)}</text>}
            <path d={path} className="viz-line" />
            {hover !== null && <line x1={x(times[hover])} x2={x(times[hover])} y1={pad.t} y2={H - pad.b} className="viz-cross" />}
            {hover !== null && <circle cx={x(times[hover])} cy={y(points[hover].rating)} r="5" className="viz-dot" />}
            <circle cx={x(times[last])} cy={y(points[last].rating)} r="4" className="viz-dot" />
            <text x={x(times[last]) + 8} y={y(points[last].rating)} className="viz-end" dominantBaseline="middle">{points[last].rating}</text>
            <rect x={pad.l} y={0} width={W - pad.l - pad.r} height={H} fill="transparent" />
          </svg>
        )}
      </div>
      {t.node}
    </div>
  );
}
