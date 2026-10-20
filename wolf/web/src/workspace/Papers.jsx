import { useState } from 'react';
import { Badge, ErrorNote, Field, Icon, Loading, toast } from '../ui.jsx';
import { PAPER_STATUS } from './meta.js';
import { useRecords } from './useRecords.js';

const EMPTY = { url: '', title: '', authors: '', year: '', venue: '', status: 'to_read', notes: '' };
const NEXT_STATUS = { to_read: 'reading', reading: 'read', read: 'to_read' };
const ORDER = { reading: 0, to_read: 1, read: 2 };
const sort = (a, b) => ORDER[a.status] - ORDER[b.status] || b.id - a.id;

function PaperForm({ initial, onSave, onCancel }) {
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
        url: f.url.trim(), title: f.title.trim(), authors: f.authors.trim(), venue: f.venue.trim(),
        year: f.year === '' ? null : Number(f.year), status: f.status, notes: f.notes.trim(),
      });
    } catch (e2) {
      setErr(e2);
      setBusy(false);
    }
  };

  return (
    <form className="record-form" onSubmit={submit}>
      <Field label="Link" hint="DOI, arXiv, publisher or PDF link.">
        <input className="input" type="url" value={f.url} onChange={set('url')} placeholder="https://doi.org/…" autoFocus />
      </Field>
      <Field label="Title"><input className="input" value={f.title} onChange={set('title')} maxLength={300} required /></Field>
      <div className="grid-3">
        <Field label="Authors"><input className="input" value={f.authors} onChange={set('authors')} maxLength={300} placeholder="Vaswani et al." /></Field>
        <Field label="Year"><input className="input tnum" type="number" min="1800" max="2100" value={f.year} onChange={set('year')} /></Field>
        <Field label="Journal or conference"><input className="input" value={f.venue} onChange={set('venue')} maxLength={200} /></Field>
      </div>
      <Field label="Status">
        <div className="segmented">
          {Object.entries(PAPER_STATUS).map(([k, v]) => (
            <button key={k} type="button" className={f.status === k ? 'is-on' : ''} onClick={() => setF({ ...f, status: k })}>{v.label}</button>
          ))}
        </div>
      </Field>
      <Field label="Notes" hint="Key findings, method, why it matters for this research.">
        <textarea className="input" rows={3} value={f.notes} onChange={set('notes')} maxLength={10000} />
      </Field>
      <ErrorNote error={err} />
      <div className="record-form-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save paper'}</button>
      </div>
    </form>
  );
}

export default function Papers({ entity, onCount }) {
  const r = useRecords(entity.id, 'papers', sort);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState('all');

  const counts = Object.fromEntries(Object.keys(PAPER_STATUS).map((k) => [k, r.list.filter((p) => p.status === k).length]));
  const shown = r.list.filter((p) => filter === 'all' || p.status === filter);

  const cycle = async (p) => {
    try { await r.update(p.id, { status: NEXT_STATUS[p.status] }); } catch (e) { toast(e.message, 'danger'); }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Papers <span className="dash-count">{r.list.length}</span></h3>
          <p className="sub">Your reading list for the literature review. Click a status to move it along.</p>
        </div>
        {!adding && <button className="btn btn-primary btn-sm" onClick={() => { setAdding(true); setEditing(null); }}><Icon name="plus" size={15} />Add paper</button>}
      </div>

      {adding && (
        <PaperForm initial={EMPTY} onCancel={() => setAdding(false)}
          onSave={async (b) => { await r.add(b); setAdding(false); onCount?.(1); toast('Paper added'); }} />
      )}

      {r.list.length > 0 && (
        <div className="chips-filter" role="tablist" aria-label="Filter papers">
          <button role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>All {r.list.length}</button>
          {Object.entries(PAPER_STATUS).map(([k, v]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'is-on' : ''} onClick={() => setFilter(k)}>{v.label} {counts[k]}</button>
          ))}
        </div>
      )}

      {r.loading && !r.data && <Loading />}
      <ErrorNote error={r.error} onRetry={r.reload} />
      {r.data && !r.list.length && !adding && <p className="empty">No papers yet. Save links to papers as you find them.</p>}

      <ul className="record-list">
        {shown.map((p) => (
          <li key={p.id} className={`record paper is-${p.status}`}>
            {editing === p.id ? (
              <PaperForm initial={{ ...p, year: p.year ?? '' }} onCancel={() => setEditing(null)}
                onSave={async (b) => { await r.update(p.id, b); setEditing(null); toast('Paper saved'); }} />
            ) : (
              <>
                <div className="record-row">
                  <button type="button" className="status-btn" onClick={() => cycle(p)} title="Change status"
                    aria-label={`Status: ${PAPER_STATUS[p.status].label}. Change to ${PAPER_STATUS[NEXT_STATUS[p.status]].label}`}>
                    <Badge tone={PAPER_STATUS[p.status].tone}>{PAPER_STATUS[p.status].label}</Badge>
                  </button>
                  <button type="button" className="record-main" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
                    <span className="strong record-title">{p.title}</span>
                    <span className="sub">{[p.authors, p.year, p.venue].filter(Boolean).join(' · ') || 'No details yet'}</span>
                  </button>
                  <div className="task-actions is-shown">
                    {p.url && (
                      <a className="icon-btn" href={p.url} target="_blank" rel="noreferrer noopener" aria-label={`Open "${p.title}"`} title="Open paper">
                        <Icon name="external" size={16} />
                      </a>
                    )}
                    <button type="button" className="icon-btn" onClick={() => { setEditing(p.id); setAdding(false); }} aria-label={`Edit "${p.title}"`} title="Edit"><Icon name="edit" size={16} /></button>
                    <button type="button" className="icon-btn danger" onClick={async () => { if (await r.remove(p.id, `"${p.title}"`)) onCount?.(-1); }} aria-label={`Delete "${p.title}"`} title="Delete"><Icon name="trash" size={16} /></button>
                  </div>
                </div>
                {open === p.id && (
                  <div className="task-detail is-view">
                    {p.url && <a className="link paper-url" href={p.url} target="_blank" rel="noreferrer noopener"><Icon name="link" size={14} />{p.url}</a>}
                    {p.notes ? <p className="prewrap task-notes">{p.notes}</p> : <p className="sub">No notes yet.</p>}
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
