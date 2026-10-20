import { useState } from 'react';
import { w } from '../api.js';
import { useAsync } from '../useAsync.js';
import { Badge, ErrorNote, Field, Icon, Loading, toast } from '../ui.jsx';
import { clock, shortDate, today } from '../workspace/meta.js';
import { PLATFORMS, cfRank, countdown, minutes } from './meta.js';

const blank = () => ({
  platform: 'codeforces', name: '', url: '', date: today(), start: '', durationMin: '', rank: '', oldRating: '', newRating: '',
  solved: '', total: '', notes: '',
});
const toForm = (c) => Object.fromEntries(Object.entries({ ...blank(), ...c }).map(([k, v]) => [k, v ?? '']));
const n = (v) => (v === '' ? null : Number(v));

function ContestForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        platform: f.platform, name: f.name.trim(), url: f.url.trim(), date: f.date, start: f.start || null,
        durationMin: n(f.durationMin), rank: n(f.rank), oldRating: n(f.oldRating), newRating: n(f.newRating),
        solved: n(f.solved), total: n(f.total), notes: f.notes.trim(),
      });
    } catch (e2) {
      setErr(e2);
      setBusy(false);
    }
  };
  return (
    <form className="record-form" onSubmit={submit}>
      <div className="grid-3">
        <Field label="Contest"><input className="input" value={f.name} onChange={set('name')} maxLength={200} required autoFocus placeholder="Codeforces Round 900 (Div. 2)" /></Field>
        <Field label="Platform">
          <select className="input select" value={f.platform} onChange={set('platform')}>
            {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Link"><input className="input" type="url" value={f.url} onChange={set('url')} placeholder="https://…" /></Field>
      </div>
      <div className="grid-3">
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={set('date')} required /></Field>
        <Field label="Starts"><input className="input" type="time" value={f.start} onChange={set('start')} /></Field>
        <Field label="Length (minutes)"><input className="input tnum" type="number" min="1" value={f.durationMin} onChange={set('durationMin')} placeholder="120" /></Field>
      </div>
      <p className="sub">Results, once it is over. A future contest with no results shows on your calendar as planned.</p>
      <div className="grid-3">
        <Field label="Solved"><input className="input tnum" type="number" min="0" value={f.solved} onChange={set('solved')} /></Field>
        <Field label="Out of"><input className="input tnum" type="number" min="0" value={f.total} onChange={set('total')} /></Field>
        <Field label="Rank"><input className="input tnum" type="number" min="1" value={f.rank} onChange={set('rank')} /></Field>
      </div>
      <div className="grid-3">
        <Field label="Rating before"><input className="input tnum" type="number" value={f.oldRating} onChange={set('oldRating')} /></Field>
        <Field label="Rating after"><input className="input tnum" type="number" value={f.newRating} onChange={set('newRating')} /></Field>
      </div>
      <Field label="Notes" hint="What went well, what cost time, what to practise next.">
        <textarea className="input" rows={3} value={f.notes} onChange={set('notes')} maxLength={10000} />
      </Field>
      <ErrorNote error={err} />
      <div className="record-form-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save contest'}</button>
      </div>
    </form>
  );
}

function Delta({ c }) {
  if (c.newRating == null) return null;
  const d = c.oldRating != null ? c.newRating - c.oldRating : null;
  const rank = c.platform === 'codeforces' ? cfRank(c.newRating) : null;
  return (
    <span className="cp-delta tnum">
      {rank && <i className="rank-dot" style={{ background: rank.dot }} title={rank.name} />}
      <span className="strong">{c.newRating}</span>
      {d != null && <Badge tone={d > 0 ? 'ok' : d < 0 ? 'danger' : 'muted'}>{d > 0 ? '▲ +' : d < 0 ? '▼ ' : ''}{d}</Badge>}
    </span>
  );
}

/** Contests taken and planned, with results and notes. */
export default function Contests({ onChanged, onUpsolve }) {
  const res = useAsync(() => w('cp/contests'), []);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const list = res.data || [];
  const planned = list.filter((c) => c.date >= today() && c.rank == null && c.newRating == null).reverse();
  const past = list.filter((c) => !planned.includes(c));

  const save = async (c, body) => {
    const saved = c ? await w(`cp/contests/${c.id}`, { method: 'PATCH', body }) : await w('cp/contests', { method: 'POST', body });
    res.setData((l) => (c ? l.map((x) => (x.id === c.id ? { ...saved, upsolve: x.upsolve } : x)) : [saved, ...l]).sort((a, b) => b.date.localeCompare(a.date)));
    onChanged();
  };
  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try {
      await w(`cp/contests/${c.id}`, { method: 'DELETE' });
      res.setData((l) => l.filter((x) => x.id !== c.id));
      onChanged();
    } catch (e) { toast(e.message, 'danger'); }
  };

  const row = (c) => (
    <li key={c.id} className="record">
      {editing === c.id ? (
        <ContestForm initial={toForm(c)} onCancel={() => setEditing(null)} onSave={async (b) => { await save(c, b); setEditing(null); toast('Contest saved'); }} />
      ) : (
        <div className="record-row">
          <span className="cp-date tnum">{shortDate(c.date)}{c.start && <span className="sub">{clock(c.start)}</span>}</span>
          <span className="record-main is-static">
            <span className="strong record-title">{c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="link-plain">{c.name}</a> : c.name}</span>
            <span className="sub">
              {PLATFORMS[c.platform]?.label}
              {c.durationMin && ` · ${minutes(c.durationMin)}`}
              {c.solved != null && ` · solved ${c.solved}${c.total ? `/${c.total}` : ''}`}
              {c.rank != null && ` · rank ${c.rank}`}
              {c.notes && ` · ${c.notes.slice(0, 80)}`}
            </span>
          </span>
          {c.upsolve > 0 && <button type="button" className="chip chip-btn" onClick={() => onUpsolve(c)}><Icon name="repeat" size={12} />{c.upsolve} to upsolve</button>}
          <Delta c={c} />
          <div className="task-actions is-shown">
            <button type="button" className="icon-btn" onClick={() => { setEditing(c.id); setAdding(false); }} aria-label={`Edit ${c.name}`} title="Edit"><Icon name="edit" size={16} /></button>
            <button type="button" className="icon-btn danger" onClick={() => remove(c)} aria-label={`Delete ${c.name}`} title="Delete"><Icon name="trash" size={16} /></button>
          </div>
        </div>
      )}
    </li>
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Contests <span className="dash-count">{past.length}</span></h3>
          <p className="sub">Results and notes for each contest. Codeforces import fills in rated rounds.</p>
        </div>
        {!adding && <button className="btn btn-primary btn-sm" onClick={() => { setAdding(true); setEditing(null); }}><Icon name="plus" size={15} />Add contest</button>}
      </div>
      {adding && <ContestForm initial={blank()} onCancel={() => setAdding(false)} onSave={async (b) => { await save(null, b); setAdding(false); toast('Contest added'); }} />}
      {res.loading && !res.data && <Loading />}
      <ErrorNote error={res.error} onRetry={res.reload} />
      {planned.length > 0 && (
        <>
          <p className="agenda-group">Planned</p>
          <ul className="record-list">{planned.map((c) => (
            <li key={c.id} className="record">
              <div className="record-row">
                <span className="cp-date tnum">{shortDate(c.date)}{c.start && <span className="sub">{clock(c.start)}</span>}</span>
                <span className="record-main is-static">
                  <span className="strong record-title">{c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="link-plain">{c.name}</a> : c.name}</span>
                  <span className="sub">{PLATFORMS[c.platform]?.label}{c.start && ` · ${countdown(`${c.date}T${c.start}:00`)}`}</span>
                </span>
                <Badge tone="info">On calendar</Badge>
                <div className="task-actions is-shown">
                  <button type="button" className="icon-btn" onClick={() => setEditing(c.id)} aria-label={`Add results for ${c.name}`} title="Add results"><Icon name="edit" size={16} /></button>
                  <button type="button" className="icon-btn danger" onClick={() => remove(c)} aria-label={`Delete ${c.name}`} title="Delete"><Icon name="trash" size={16} /></button>
                </div>
              </div>
              {editing === c.id && <ContestForm initial={toForm(c)} onCancel={() => setEditing(null)} onSave={async (b) => { await save(c, b); setEditing(null); toast('Contest saved'); }} />}
            </li>
          ))}</ul>
          <p className="agenda-group">Taken</p>
        </>
      )}
      {res.data && !past.length && <p className="empty">No contests yet. Add one, import from Codeforces, or plan one from Upcoming.</p>}
      <ul className="record-list">{past.map(row)}</ul>
    </section>
  );
}
