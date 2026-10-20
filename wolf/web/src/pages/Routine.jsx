import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { w } from '../api.js';
import { useAsync } from '../useAsync.js';
import { Badge, ErrorNote, Field, Icon, Loading, Switch, toast } from '../ui.jsx';
import AgendaItem from '../workspace/AgendaItem.jsx';
import { useDayTimeline } from '../workspace/DayView.jsx';
import MeetingModal from '../workspace/MeetingModal.jsx';
import RoutineDayModal from '../workspace/RoutineDayModal.jsx';
import WeekTimeline from '../workspace/WeekTimeline.jsx';
import {
  CATEGORIES, SWATCHES, WEEKDAYS, WEEKDAYS_SHORT, WEEK_START, addDays, dayList, shortDate, timeRange, today, weekOrder, weekdayOf,
} from '../workspace/meta.js';

const order = weekOrder();
const WORKDAYS = [0, 1, 2, 3, 4]; // Sun–Thu
const VIEW_KEY = 'wolf-routine-view';

/** 'Sat, Mon, Wed · 10 am – 11 am · Fri 3 pm – 4 pm' */
function whenText(r) {
  const own = order.filter((d) => r.weekdays.includes(d) && r.dayTimes?.[d]);
  const usualDays = r.weekdays.filter((d) => !own.includes(d));
  return [
    usualDays.length ? `${dayList(usualDays)} · ${timeRange(r.start, r.end)}` : null,
    ...own.map((d) => `${WEEKDAYS_SHORT[d]} ${timeRange(r.dayTimes[d].start, r.dayTimes[d].end)}`),
  ].filter(Boolean).join(' · ');
}

/** Per-weekday times: each day the routine runs on can keep the usual time or have its own. */
function DayTimes({ f, setF }) {
  const days = order.filter((d) => f.weekdays.includes(d));
  if (!days.length) return null;
  const setDay = (d, v) => {
    const next = { ...f.dayTimes };
    if (v) next[d] = v; else delete next[d];
    setF({ ...f, dayTimes: next });
  };
  return (
    <div className="field">
      <span className="field-label">Time on each day</span>
      <ul className="day-times">
        {days.map((d) => {
          const own = f.dayTimes[d];
          return (
            <li key={d}>
              <span className="day-times-day">{WEEKDAYS[d]}</span>
              {own ? (
                <>
                  <input className="input" type="time" value={own.start} onChange={(e) => setDay(d, { ...own, start: e.target.value })} aria-label={`${WEEKDAYS[d]} starts`} required />
                  <span className="sub">to</span>
                  <input className="input" type="time" value={own.end} onChange={(e) => setDay(d, { ...own, end: e.target.value })} aria-label={`${WEEKDAYS[d]} ends`} />
                  <button type="button" className="btn-text" onClick={() => setDay(d, null)}>Use usual</button>
                </>
              ) : (
                <>
                  <span className="sub day-times-usual">{f.start ? timeRange(f.start, f.end) : 'Usual time'}</span>
                  <button type="button" className="btn-text" onClick={() => setDay(d, { start: f.start || '09:00', end: f.end || '' })}>Different time</button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function startOfWeek(d) {
  return addDays(d, -((weekdayOf(d) - WEEK_START + 7) % 7));
}

function RoutineForm({ initial, entities, onSave, onCancel, onDelete }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleDay = (d) => setF({ ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d] });
  const sameDays = (a) => a.length === f.weekdays.length && a.every((d) => f.weekdays.includes(d));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const dayTimes = Object.fromEntries(Object.entries(f.dayTimes)
        .filter(([d, t]) => f.weekdays.includes(Number(d)) && t.start)
        .map(([d, t]) => [d, { start: t.start, end: t.end || null }]));
      await onSave({
        title: f.title.trim(), weekdays: f.weekdays, start: f.start || null, end: f.end || null, dayTimes,
        entityId: f.entityId ? Number(f.entityId) : null, color: f.color, note: f.note.trim(),
        startDate: f.startDate || null, endDate: f.endDate || null, active: f.active,
      });
    } catch (e2) {
      setErr(e2);
      setBusy(false);
    }
  };

  return (
    <form className="panel routine-form" onSubmit={submit}>
      <h3>{initial.id ? 'Edit routine' : 'New routine'}</h3>
      <Field label="What"><input className="input" value={f.title} onChange={set('title')} maxLength={120} required autoFocus placeholder="Tutoring" /></Field>
      <div className="field">
        <span className="field-label">Repeats on</span>
        <div className="day-pick" role="group" aria-label="Days">
          {order.map((d) => (
            <button key={d} type="button" className={f.weekdays.includes(d) ? 'is-on' : ''} aria-pressed={f.weekdays.includes(d)} onClick={() => toggleDay(d)}>
              {WEEKDAYS_SHORT[d]}
            </button>
          ))}
        </div>
        <div className="day-presets">
          <button type="button" className={`chip chip-btn ${sameDays(WORKDAYS) ? 'is-on' : ''}`} onClick={() => setF({ ...f, weekdays: WORKDAYS })}>Sun–Thu</button>
          <button type="button" className={`chip chip-btn ${f.weekdays.length === 7 ? 'is-on' : ''}`} onClick={() => setF({ ...f, weekdays: [0, 1, 2, 3, 4, 5, 6] })}>Every day</button>
          <button type="button" className={`chip chip-btn ${sameDays([5, 6]) ? 'is-on' : ''}`} onClick={() => setF({ ...f, weekdays: [5, 6] })}>Fri–Sat</button>
        </div>
      </div>
      <div className="grid-3">
        <Field label="Usual start" hint="Optional."><input className="input" type="time" value={f.start} onChange={set('start')} /></Field>
        <Field label="Usual end" hint="Optional."><input className="input" type="time" value={f.end} onChange={set('end')} /></Field>
        <Field label="Part of" hint="Optional link to an entry.">
          <select className="input select" value={f.entityId} onChange={set('entityId')}>
            <option value="">Nothing</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{CATEGORIES[e.category].label}: {e.title}</option>)}
          </select>
        </Field>
      </div>
      <DayTimes f={f} setF={setF} />
      <div className="grid-2">
        <Field label="From" hint="Optional first day."><input className="input" type="date" value={f.startDate} onChange={set('startDate')} /></Field>
        <Field label="Until" hint="Optional last day, e.g. end of term."><input className="input" type="date" value={f.endDate} onChange={set('endDate')} /></Field>
      </div>
      <Field label="Note"><input className="input" value={f.note} onChange={set('note')} maxLength={500} placeholder="Student: Rafi, class 9 physics" /></Field>
      <div className="field">
        <span className="field-label">Colour</span>
        <div className="swatches" role="radiogroup" aria-label="Colour">
          {SWATCHES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={f.color === c} aria-label={c}
              className={`swatch ${f.color === c ? 'is-on' : ''}`} style={{ background: c }} onClick={() => setF({ ...f, color: c })} />
          ))}
        </div>
      </div>
      {initial.id && <Switch checked={f.active} onChange={(active) => setF({ ...f, active })} label="Active (paused routines are hidden from the week and calendar)" />}
      <ErrorNote error={err} />
      <div className="record-form-actions">
        {onDelete && <button type="button" className="btn btn-danger-ghost btn-sm push-right" onClick={onDelete}><Icon name="trash" size={15} />Delete</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={busy || !f.weekdays.length}>{busy ? 'Saving…' : 'Save routine'}</button>
      </div>
    </form>
  );
}

const BLANK = { title: '', weekdays: [], start: '', end: '', entityId: '', color: SWATCHES[0], note: '', startDate: '', endDate: '', active: true, dayTimes: {} };
const toForm = (r) => ({
  ...r, start: r.start || '', end: r.end || '', entityId: r.entityId ? String(r.entityId) : '', startDate: r.startDate || '', endDate: r.endDate || '',
  dayTimes: Object.fromEntries(Object.entries(r.dayTimes || {}).map(([d, t]) => [d, { start: t.start, end: t.end || '' }])),
});

export default function Routine() {
  const [week, setWeek] = useState(() => startOfWeek(today()));
  const [form, setForm] = useState(null); // null | BLANK | routine
  const [view, setView] = useState(() => { try { return localStorage.getItem(VIEW_KEY) || 'week'; } catch { return 'week'; } });
  const [routineDay, setRoutineDay] = useState(null); // a routine on one date
  const [meeting, setMeeting] = useState(null);
  const [params, setParams] = useSearchParams();
  const routines = useAsync(() => w('routines'), []);
  const entities = useAsync(() => w('entities'), []);
  const board = useAsync(() => w(`calendar?from=${week}&to=${addDays(week, 6)}&skipped=1`), [week]);
  const day = useDayTimeline(() => board.reload());

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const boardItems = (board.data || []).filter((e) => ['routine', 'class', 'lab'].includes(e.type) && !e.skipped);
  // The week grid shows everything with a time, so the whole day is there.
  const timed = (board.data || []).filter((e) => e.time || e.skipped);
  const reloadAll = () => { routines.reload(); board.reload(); };
  const pickView = (v) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch {} };

  // /routine?edit=3 (from a day's "Edit every week") opens that routine's form.
  useEffect(() => {
    const id = Number(params.get('edit'));
    const r = id && routines.data?.find((x) => x.id === id);
    if (r) {
      setForm(r);
      setParams({}, { replace: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [routines.data, params]);
  const onChanged = (e) => board.setData((list) => list.map((x) => (x.type === e.type && x.id === e.id && x.date === e.date ? e : x)));

  const save = async (body) => {
    if (form.id) await w(`routines/${form.id}`, { method: 'PATCH', body });
    else await w('routines', { method: 'POST', body });
    toast(form.id ? 'Routine saved' : 'Routine added');
    setForm(null);
    reloadAll();
  };
  const remove = async (r) => {
    if (!window.confirm(`Delete "${r.title}" from your routine?`)) return;
    try {
      await w(`routines/${r.id}`, { method: 'DELETE' });
      setForm(null);
      reloadAll();
    } catch (e) { toast(e.message, 'danger'); }
  };
  const setActive = async (r, active) => {
    try {
      await w(`routines/${r.id}`, { method: 'PATCH', body: { active } });
      reloadAll();
    } catch (e) { toast(e.message, 'danger'); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Routine</h1>
          <p className="muted">Things that repeat every week: tutoring, gym, classes. Tick them off each day.</p>
        </div>
        {!form && <button className="btn btn-primary" onClick={() => setForm(BLANK)}><Icon name="plus" size={16} />Add routine</button>}
      </div>

      {form && (
        <RoutineForm key={form.id || 'new'} initial={toForm(form)} entities={(entities.data || []).filter((e) => e.status !== 'archived')}
          onSave={save} onCancel={() => setForm(null)} onDelete={form.id ? () => remove(form) : null} />
      )}

      <section className="stack">
        <div className="toolbar">
          <h2 className="week-title">
            {week === startOfWeek(today()) ? 'This week' : `Week of ${shortDate(week)}`}
          </h2>
          <div className="week-nav">
            <div className="segmented" role="group" aria-label="Week view">
              <button type="button" className={view === 'week' ? 'is-on' : ''} aria-pressed={view === 'week'} onClick={() => pickView('week')}>Hours</button>
              <button type="button" className={view === 'list' ? 'is-on' : ''} aria-pressed={view === 'list'} onClick={() => pickView('list')}>List</button>
            </div>
            <button className="icon-btn" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><Icon name="back" size={17} /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeek(startOfWeek(today()))}>Today</button>
            <button className="icon-btn flip" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><Icon name="back" size={17} /></button>
          </div>
        </div>
        <ErrorNote error={board.error} onRetry={board.reload} />
        {view === 'week' && (board.data
          ? <WeekTimeline days={days} events={timed} onRoutine={setRoutineDay} onOpen={(m) => setMeeting(m.id)} onDay={day.open} />
          : !board.error && <Loading />)}
        {view === 'list' && <div className="week-board">
          {days.map((d) => {
            const items = boardItems.filter((e) => e.date === d);
            return (
              <div key={d} className={`week-col ${d === today() ? 'is-today' : ''}`}>
                <div className="week-col-head">
                  <span className="strong">{WEEKDAYS_SHORT[weekdayOf(d)]}</span>
                  <span className="sub tnum">{shortDate(d)}</span>
                </div>
                {items.length
                  ? <ul className="agenda is-compact">{items.map((e) => <AgendaItem key={`${e.type}${e.id}`} e={e} onChanged={onChanged} />)}</ul>
                  : board.data && <p className="sub week-empty">Free</p>}
              </div>
            );
          })}
        </div>}
        <p className="sub">Tap a routine block to tick it off, or to change or skip it on that day only. Tap a day for its timeline.</p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>All routines <span className="dash-count">{routines.data?.length ?? 0}</span></h3>
        </div>
        {routines.loading && !routines.data && <Loading />}
        <ErrorNote error={routines.error} onRetry={routines.reload} />
        {routines.data && !routines.data.length && <p className="empty">Nothing yet. Add tutoring, gym or anything else that repeats.</p>}
        <ul className="record-list">
          {(routines.data || []).map((r) => (
            <li key={r.id} className={`record ${r.active ? '' : 'is-paused'}`} style={{ '--biz': r.color }}>
              <div className="record-row">
                <span className="routine-dot" aria-hidden="true" />
                <span className="record-main is-static">
                  <span className="strong">{r.title} {!r.active && <Badge>Paused</Badge>}</span>
                  <span className="sub">
                    {whenText(r)}
                    {r.entityTitle && <> · <Link to={`/w/${r.entityId}`} className="link">{r.entityTitle}</Link></>}
                    {r.endDate && ` · until ${shortDate(r.endDate)}`}
                    {r.note && ` · ${r.note}`}
                  </span>
                </span>
                <div className="task-actions is-shown">
                  <button type="button" className="icon-btn" onClick={() => setActive(r, !r.active)} aria-label={r.active ? `Pause "${r.title}"` : `Resume "${r.title}"`} title={r.active ? 'Pause' : 'Resume'}>
                    <Icon name={r.active ? 'pause' : 'play'} size={16} />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => { setForm(r); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label={`Edit "${r.title}"`} title="Edit"><Icon name="edit" size={16} /></button>
                  <button type="button" className="icon-btn danger" onClick={() => remove(r)} aria-label={`Delete "${r.title}"`} title="Delete"><Icon name="trash" size={16} /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="sub">Class and lab times come from your courses. Add them under an academic entry → Class times.</p>
      </section>
      {day.modal}
      {routineDay && <RoutineDayModal e={routineDay} onClose={() => setRoutineDay(null)} onSaved={board.reload} />}
      {meeting && <MeetingModal id={meeting} onClose={() => setMeeting(null)} onSaved={board.reload} />}
    </div>
  );
}
