import { useState } from 'react';
import { w } from '../api.js';
import { useAsync } from '../useAsync.js';
import { ErrorNote, Field, Icon, Loading, toast } from '../ui.jsx';
import { COMMON_TAGS, STARTER_TOPICS, TOPIC_STATUS } from './meta.js';

const blank = { name: '', tag: '', status: 'todo', links: '', notes: '' };

function TopicForm({ initial, tags, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await onSave({ name: f.name.trim(), tag: f.tag, status: f.status, links: f.links.split(/\s+/).filter(Boolean), notes: f.notes.trim() });
    } catch (e2) {
      setErr(e2);
      setBusy(false);
    }
  };
  return (
    <form className="record-form" onSubmit={submit}>
      <div className="grid-3">
        <Field label="Topic"><input className="input" value={f.name} onChange={set('name')} maxLength={120} required autoFocus placeholder="Segment tree with lazy propagation" /></Field>
        <Field label="Practice tag" hint="Counts your solved problems with this tag.">
          <select className="input select" value={f.tag} onChange={set('tag')}>
            <option value="">None</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="input select" value={f.status} onChange={set('status')}>
            {Object.entries(TOPIC_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Resources" hint="Links to articles, videos or problem lists. One per line.">
        <textarea className="input" rows={2} value={f.links} onChange={set('links')} placeholder="https://cp-algorithms.com/…" />
      </Field>
      <Field label="Notes" hint="Templates, pitfalls, when to use it.">
        <textarea className="input" rows={3} value={f.notes} onChange={set('notes')} maxLength={10000} />
      </Field>
      <ErrorNote error={err} />
      <div className="record-form-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save topic'}</button>
      </div>
    </form>
  );
}

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

/** The learning roadmap: topics with a status, resources, notes and how much practice each has had. */
export default function Topics({ allTags, onPractice }) {
  const res = useAsync(() => w('cp/topics'), []);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);
  const list = res.data || [];
  const tags = [...new Set([...allTags, ...COMMON_TAGS])].sort();

  const save = async (t, body) => {
    const saved = t ? await w(`cp/topics/${t.id}`, { method: 'PATCH', body }) : await w('cp/topics', { method: 'POST', body });
    res.setData((l) => (t ? l.map((x) => (x.id === t.id ? saved : x)) : [...l, saved]));
  };
  const setStatus = async (t, status) => { try { await save(t, { status }); } catch (e) { toast(e.message, 'danger'); } };
  const remove = async (t) => {
    if (!window.confirm(`Delete ${t.name}?`)) return;
    try {
      await w(`cp/topics/${t.id}`, { method: 'DELETE' });
      res.setData((l) => l.filter((x) => x.id !== t.id));
    } catch (e) { toast(e.message, 'danger'); }
  };
  const starter = async () => {
    try {
      const saved = await w('cp/topics', { method: 'POST', body: STARTER_TOPICS.map(([name, tag, link]) => ({ name, tag, links: [link] })) });
      res.setData((l) => [...l, ...saved]);
      toast(`Added ${saved.length} topics`);
    } catch (e) { toast(e.message, 'danger'); }
  };

  const done = list.filter((t) => t.status === 'done').length;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Learning <span className="dash-count">{done}/{list.length}</span></h3>
          <p className="sub">Your roadmap. Link a topic to a tag to see how much you have practised it.</p>
        </div>
        <div className="files-tools">
          {!adding && <button className="btn btn-primary btn-sm" onClick={() => { setAdding(true); setEditing(null); }}><Icon name="plus" size={15} />Add topic</button>}
        </div>
      </div>
      {list.length > 0 && (
        <div className="progress" role="img" aria-label={`${done} of ${list.length} topics comfortable`}>
          <span style={{ width: `${(done / list.length) * 100}%` }} />
        </div>
      )}
      {adding && <TopicForm initial={blank} tags={tags} onCancel={() => setAdding(false)} onSave={async (b) => { await save(null, b); setAdding(false); }} />}
      {res.loading && !res.data && <Loading />}
      <ErrorNote error={res.error} onRetry={res.reload} />
      {res.data && !list.length && !adding && (
        <div className="empty">
          <p>No topics yet.</p>
          <button className="btn btn-ghost btn-sm" onClick={starter}><Icon name="book" size={15} />Add a starter roadmap ({STARTER_TOPICS.length} topics)</button>
        </div>
      )}
      <ul className="record-list">
        {list.map((t) => (
          <li key={t.id} className={`record cp-topic is-${t.status}`}>
            {editing === t.id ? (
              <TopicForm initial={{ ...t, links: t.links.join('\n') }} tags={tags} onCancel={() => setEditing(null)}
                onSave={async (b) => { await save(t, b); setEditing(null); }} />
            ) : (
              <>
                <div className="record-row">
                  <select className="input select cp-topic-status" value={t.status} onChange={(e) => setStatus(t, e.target.value)} aria-label={`Status of ${t.name}`}>
                    {Object.entries(TOPIC_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <button type="button" className="record-main" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
                    <span className="strong record-title">{t.name}</span>
                    <span className="sub">{t.links.length ? t.links.map(host).join(' · ') : 'No resources yet'}</span>
                  </button>
                  {t.tag && (
                    <button type="button" className="chip chip-btn" onClick={() => onPractice(t.tag)} title={`Show solved ${t.tag} problems`}>
                      {t.solved} solved · {t.tag}
                    </button>
                  )}
                  <div className="task-actions is-shown">
                    <button type="button" className="icon-btn" onClick={() => { setEditing(t.id); setAdding(false); }} aria-label={`Edit ${t.name}`} title="Edit"><Icon name="edit" size={16} /></button>
                    <button type="button" className="icon-btn danger" onClick={() => remove(t)} aria-label={`Delete ${t.name}`} title="Delete"><Icon name="trash" size={16} /></button>
                  </div>
                </div>
                {open === t.id && (
                  <div className="cp-detail">
                    {t.links.length > 0 && (
                      <ul className="cp-links">{t.links.map((l) => <li key={l}><a href={l} target="_blank" rel="noreferrer" className="link"><Icon name="external" size={13} /> {l}</a></li>)}</ul>
                    )}
                    {t.notes ? <p className="prewrap">{t.notes}</p> : <p className="sub">No notes yet.</p>}
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
