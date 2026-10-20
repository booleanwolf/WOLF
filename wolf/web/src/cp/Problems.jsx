import { useEffect, useState } from 'react';
import { w } from '../api.js';
import { useAsync } from '../useAsync.js';
import { Badge, ErrorNote, Field, Icon, Loading, toast } from '../ui.jsx';
import { shortDate, today } from '../workspace/meta.js';
import { COMMON_TAGS, PLATFORMS, PROBLEM_STATUS, cfRank, minutes, parseProblemUrl } from './meta.js';

const blank = () => ({
  url: '', platform: 'codeforces', code: '', title: '', rating: '', tags: '', status: 'solved', solvedOn: today(),
  timeMin: '', withHelp: false, notes: '',
});
const toForm = (p) => ({
  ...p, code: p.code || '', rating: p.rating ?? '', tags: p.tags.join(', '), solvedOn: p.solvedOn || '', timeMin: p.timeMin ?? '',
});

export function RatingChip({ rating, platform }) {
  if (rating == null) return null;
  const dot = platform === 'codeforces' ? cfRank(rating).dot : null;
  return <span className="chip tnum" title={dot ? cfRank(rating).name : 'Rating'}>{dot && <i className="rank-dot" style={{ background: dot }} />}{rating}</span>;
}

function ProblemForm({ initial, allTags, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  // Pasting a link fills in the platform, code and (where the link has it) the name.
  const onUrl = (e) => {
    const url = e.target.value;
    const p = parseProblemUrl(url);
    setF((cur) => ({ ...cur, url, ...(p && { platform: p.platform, code: p.code || cur.code, title: cur.title || p.title }) }));
  };
  const addTag = (tag) => {
    const list = f.tags.split(',').map((x) => x.trim()).filter(Boolean);
    if (!list.includes(tag)) setF({ ...f, tags: [...list, tag].join(', ') });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        platform: f.platform, code: f.code.trim() || null, title: f.title.trim(), url: f.url.trim(),
        rating: f.rating === '' ? null : Number(f.rating), tags: f.tags.split(',').map((x) => x.trim()).filter(Boolean),
        status: f.status, solvedOn: f.status === 'solved' ? f.solvedOn || today() : f.solvedOn || null,
        timeMin: f.timeMin === '' ? null : Number(f.timeMin), withHelp: f.withHelp, notes: f.notes.trim(),
      });
    } catch (e2) {
      setErr(e2);
      setBusy(false);
    }
  };

  // Common tags first; skip Codeforces' special markers like "*special".
  const suggestions = [...new Set([...COMMON_TAGS, ...allTags])].filter((t) => !t.startsWith('*') && !f.tags.includes(t)).slice(0, 14);

  return (
    <form className="record-form" onSubmit={submit}>
      <Field label="Link" hint="Paste a Codeforces, AtCoder, LeetCode, CodeChef or CSES link to fill the rest.">
        <input className="input" type="url" value={f.url} onChange={onUrl} placeholder="https://codeforces.com/contest/1850/problem/C" autoFocus={!initial.id} />
      </Field>
      <div className="grid-3">
        <Field label="Problem"><input className="input" value={f.title} onChange={set('title')} maxLength={200} required placeholder="C. Word on the Paper" /></Field>
        <Field label="Platform">
          <select className="input select" value={f.platform} onChange={set('platform')}>
            {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="Code" hint="Optional, e.g. 1850C."><input className="input" value={f.code} onChange={set('code')} maxLength={40} /></Field>
      </div>
      <div className="grid-3">
        <Field label="Status">
          <select className="input select" value={f.status} onChange={set('status')}>
            {Object.entries(PROBLEM_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label={f.status === 'solved' ? 'Solved on' : 'Date'}><input className="input" type="date" value={f.solvedOn} onChange={set('solvedOn')} /></Field>
        <Field label="Difficulty rating"><input className="input tnum" type="number" min="0" max="5000" step="100" value={f.rating} onChange={set('rating')} placeholder="1400" /></Field>
      </div>
      <Field label="Tags" hint="Comma separated.">
        <input className="input" value={f.tags} onChange={set('tags')} placeholder="greedy, sortings" />
      </Field>
      {suggestions.length > 0 && (
        <div className="tag-suggest">
          {suggestions.map((t) => <button key={t} type="button" className="chip chip-btn" onClick={() => addTag(t)}>+ {t}</button>)}
        </div>
      )}
      <div className="grid-3">
        <Field label="Time spent (minutes)"><input className="input tnum" type="number" min="0" value={f.timeMin} onChange={set('timeMin')} /></Field>
        <label className="check-line"><input type="checkbox" checked={f.withHelp} onChange={set('withHelp')} />Needed the editorial or a hint</label>
      </div>
      <Field label="Key idea" hint="What made it click. Future you will thank you before a contest.">
        <textarea className="input" rows={3} value={f.notes} onChange={set('notes')} maxLength={10000} />
      </Field>
      <ErrorNote error={err} />
      <div className="record-form-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : initial.id ? 'Save' : 'Add problem'}</button>
      </div>
    </form>
  );
}

const PAGE = 100;

/** The problem log. filter = { status, platform, tag, q } lives in the page so charts can set it. */
export default function Problems({ filter, setFilter, summary, onChanged }) {
  const [limit, setLimit] = useState(PAGE);
  const params = new URLSearchParams(Object.entries({ ...filter, limit }).filter(([, v]) => v !== '' && v != null));
  const res = useAsync(() => w(`cp/problems?${params}`), [params.toString()]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);
  const list = res.data?.items || [];
  const put = (fn) => res.setData((d) => ({ ...d, items: fn(d.items) }));
  const set = (k, v) => { setFilter({ ...filter, [k]: v }); setLimit(PAGE); };
  // Search waits for a pause in typing.
  const [q, setQ] = useState(filter.q);
  useEffect(() => setQ(filter.q), [filter.q]);
  useEffect(() => {
    if (q === filter.q) return undefined;
    const t = setTimeout(() => set('q', q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const save = async (p, body) => {
    const saved = p
      ? await w(`cp/problems/${p.id}`, { method: 'PATCH', body })
      : await w(`cp/problems?today=${today()}`, { method: 'POST', body });
    if (p) put((l) => l.map((x) => (x.id === p.id ? saved : x)));
    else { res.reload(); toast('Problem logged'); }
    onChanged();
    return saved;
  };
  const quick = async (p, body, message) => {
    try { await save(p, body); if (message) toast(message); } catch (e) { toast(e.message, 'danger'); }
  };
  const remove = async (p) => {
    if (!window.confirm(`Delete "${p.title}" from your log?`)) return;
    try {
      await w(`cp/problems/${p.id}`, { method: 'DELETE' });
      put((l) => l.filter((x) => x.id !== p.id));
      onChanged();
    } catch (e) { toast(e.message, 'danger'); }
  };

  const counts = { '': summary ? summary.solved + summary.upsolve + summary.attempted + summary.todo : null, ...summary };

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Problems {res.data && <span className="dash-count">{res.data.total}</span>}</h3>
          <p className="sub">Everything you solve, try or want to try. Upsolve holds problems from contests you did not finish.</p>
        </div>
        {!adding && <button className="btn btn-primary btn-sm" onClick={() => { setAdding(true); setEditing(null); }}><Icon name="plus" size={15} />Log a problem</button>}
      </div>

      {adding && (
        <ProblemForm initial={{ ...blank(), status: filter.status && filter.status !== 'solved' ? filter.status : 'solved' }} allTags={summary?.allTags || []}
          onCancel={() => setAdding(false)} onSave={async (b) => { await save(null, b); setAdding(false); }} />
      )}

      <div className="cp-filters">
        <div className="chips-filter" role="tablist" aria-label="Status">
          {[['', 'All'], ...Object.entries(PROBLEM_STATUS).map(([k, v]) => [k, v.label])].map(([k, label]) => (
            <button key={k || 'all'} role="tab" aria-selected={filter.status === k} className={filter.status === k ? 'is-on' : ''} onClick={() => set('status', k)}>
              {label}{counts[k] != null && <span className="chip-count">{counts[k]}</span>}
            </button>
          ))}
        </div>
        <div className="cp-filter-row">
          <select className="input select" value={filter.platform} onChange={(e) => set('platform', e.target.value)} aria-label="Platform">
            <option value="">All platforms</option>
            {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="input select" value={filter.tag} onChange={(e) => set('tag', e.target.value)} aria-label="Tag">
            <option value="">All tags</option>
            {(summary?.allTags || []).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or code" aria-label="Search problems" />
        </div>
      </div>

      {res.loading && !res.data && <Loading />}
      <ErrorNote error={res.error} onRetry={res.reload} />
      {res.data && !list.length && (
        <p className="empty">{Object.values(filter).some(Boolean) ? 'No problems match these filters.' : 'No problems yet. Log one, or import from Codeforces.'}</p>
      )}

      <ul className="record-list">
        {list.map((p) => {
          const st = PROBLEM_STATUS[p.status];
          return (
            <li key={p.id} className={`record cp-problem is-${p.status}`}>
              {editing === p.id ? (
                <ProblemForm initial={toForm(p)} allTags={summary?.allTags || []} onCancel={() => setEditing(null)}
                  onSave={async (b) => { await save(p, b); setEditing(null); toast('Saved'); }} />
              ) : (
                <>
                  <div className="record-row">
                    <span className={`cp-status tone-${st.tone}`} title={st.label}><Icon name={st.icon} size={14} /><span className="sr-only">{st.label}</span></span>
                    <button type="button" className="record-main" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                      <span className="strong record-title">{p.title}</span>
                      <span className="sub">
                        {PLATFORMS[p.platform]?.label}{p.code ? ` ${p.code}` : ''}
                        {p.solvedOn && ` · ${shortDate(p.solvedOn)}`}
                        {p.timeMin != null && ` · ${minutes(p.timeMin)}`}
                        {p.contestName && ` · ${p.contestName}`}
                      </span>
                    </button>
                    <span className="cp-chips">
                      <RatingChip rating={p.rating} platform={p.platform} />
                      {p.withHelp && <Badge tone="info">Editorial</Badge>}
                      {p.tags.slice(0, 3).map((t) => <button key={t} type="button" className="chip chip-btn" onClick={() => set('tag', t)}>{t}</button>)}
                      {p.tags.length > 3 && <span className="chip">+{p.tags.length - 3}</span>}
                    </span>
                    <div className="task-actions is-shown">
                      {p.status !== 'solved' && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => quick(p, { status: 'solved', solvedOn: today() }, 'Nice, marked solved')}>
                          <Icon name="check" size={14} />Solved
                        </button>
                      )}
                      {p.url && <a className="icon-btn" href={p.url} target="_blank" rel="noreferrer" aria-label={`Open ${p.title}`} title="Open problem"><Icon name="external" size={16} /></a>}
                      <button type="button" className="icon-btn" onClick={() => { setEditing(p.id); setAdding(false); }} aria-label={`Edit ${p.title}`} title="Edit"><Icon name="edit" size={16} /></button>
                      <button type="button" className="icon-btn danger" onClick={() => remove(p)} aria-label={`Delete ${p.title}`} title="Delete"><Icon name="trash" size={16} /></button>
                    </div>
                  </div>
                  {open === p.id && (
                    <div className="cp-detail">
                      {p.notes ? <p className="prewrap">{p.notes}</p> : <p className="sub">No key idea written yet. Edit to add one.</p>}
                      {p.tags.length > 3 && <p className="cp-chips">{p.tags.map((t) => <span key={t} className="chip">{t}</span>)}</p>}
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {res.data && res.data.total > list.length && (
        <button className="btn btn-ghost btn-sm cp-more" onClick={() => setLimit(limit + PAGE)}>Show more ({res.data.total - list.length} left)</button>
      )}
    </section>
  );
}
