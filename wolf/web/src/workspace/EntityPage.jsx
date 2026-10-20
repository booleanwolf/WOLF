import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { w } from '../api.js';
import { date } from '../format.js';
import { useAsync } from '../useAsync.js';
import { Badge, ErrorNote, Icon, Loading, toast } from '../ui.jsx';
import Cts, { ctSummary, fmt, pct, readBest } from './Cts.jsx';
import Files from './Files.jsx';
import { useLocalFiles } from './localFiles.js';
import MeetingModal from './MeetingModal.jsx';
import NotesModal from './Notes.jsx';
import { CATEGORIES, STATUS, isOverdue, shortDate, stepState } from './meta.js';
import Papers from './Papers.jsx';
import Schedule from './Schedule.jsx';
import Stepper from './Stepper.jsx';
import Tasks from './Tasks.jsx';

// Extra sections per category, shown as tabs next to Tasks.
const TABS = {
  research: [{ id: 'papers', label: 'Papers', icon: 'book', count: 'papers' }],
  academic: [
    { id: 'schedule', label: 'Class times', icon: 'clock', count: 'slots' },
    { id: 'cts', label: 'CTs', icon: 'academic', count: 'cts' },
  ],
  project: [],
};

function CtProgress({ e }) {
  const res = useAsync(() => w(`entities/${e.id}/cts`), [e.id]);
  if (!res.data) return null;
  const { marked, got, outOf, best } = ctSummary(res.data, readBest(e.id));
  const n = best || marked.length;
  return (
    <div className="stack">
      <div className="progress-line">
        <span className="kpi-label">CTs</span>
        <span className="strong tnum">{marked.length} of {res.data.length} marked</span>
      </div>
      <p className="ct-avg">
        {marked.length ? (
          <>
            <span className="kpi-label">Average{best ? ` (best ${best})` : ''}</span>
            <span className="strong tnum">{fmt(got / n)}/{fmt(outOf / n)} · {pct(got, outOf)}%</span>
          </>
        ) : <span className="sub">No marks yet</span>}
      </p>
    </div>
  );
}

function Progress({ e, top, doneTop }) {
  const s = stepState(e);
  return (
    <section className="panel progress-panel" id="progress">
      <div className="progress-grid">
        <div className="stack">
          <div className="progress-line">
            <span className="kpi-label">Tasks</span>
            <span className="strong tnum">{doneTop} of {top.length} done</span>
          </div>
          <div className="progress" role="img" aria-label={`${doneTop} of ${top.length} tasks done`}>
            <span style={{ width: `${top.length ? (doneTop / top.length) * 100 : 0}%` }} />
          </div>
        </div>
        {s.total > 0 && (
          <div className="stack">
            <div className="progress-line">
              <span className="kpi-label">Steps</span>
              <span className="strong tnum">{s.done} of {s.total} done</span>
            </div>
            <div className="progress" role="img" aria-label={`${s.done} of ${s.total} steps done`}>
              <span style={{ width: `${(s.done / s.total) * 100}%` }} />
            </div>
          </div>
        )}
        {e.category === 'academic' && e.counts.cts > 0 && <CtProgress e={e} />}
        <dl className="kv progress-dates">
          <div><dt>Started</dt><dd>{date(e.createdAt)}</dd></div>
          <div><dt>Last change</dt><dd>{date(e.updatedAt)}</dd></div>
        </dl>
      </div>
    </section>
  );
}

export default function EntityPage() {
  const { id } = useParams();
  const res = useAsync(() => w(`entities/${id}`), [id]);
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [dialog, setDialog] = useState(null); // 'notes' | 'meeting'
  // Server records plus this device's copies (the bytes stay local until synced).
  const files = useLocalFiles(Number(id), res.data?.fileList || []);

  if (res.loading && !res.data) return <Loading />;
  if (res.error && !res.data) {
    return (
      <div className="stack">
        <Link to="/" className="back"><Icon name="back" size={16} />Dashboard</Link>
        <ErrorNote error={res.error} onRetry={res.reload} />
      </div>
    );
  }

  const e = res.data;
  const cat = CATEGORIES[e.category];
  const tasks = e.taskList;
  const setTasks = (fn) => res.setData((d) => ({ ...d, taskList: typeof fn === 'function' ? fn(d.taskList) : fn }));
  // Deleting a file unlinks it from tasks on the server; mirror that here.
  const setFiles = (fn) => res.setData((d) => {
    const fileList = typeof fn === 'function' ? fn(d.fileList) : fn;
    const ids = new Set(fileList.map((f) => f.id));
    return { ...d, fileList, taskList: d.taskList.map((t) => (t.fileId && !ids.has(t.fileId) ? { ...t, fileId: null, fileRef: '' } : t)) };
  });
  const top = tasks.filter((t) => !t.parentId);
  const doneTop = top.filter((t) => t.done).length;
  const tabs = [{ id: 'tasks', label: 'Tasks', icon: 'check' }, ...TABS[e.category], { id: 'files', label: 'Files', icon: 'paperclip', count: 'files' }];
  const counts = { ...e.counts, files: e.fileList.length };
  const tab = tabs.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'tasks';
  const bump = (key) => (delta) => res.setData((d) => ({ ...d, counts: { ...d.counts, [key]: d.counts[key] + delta } }));

  const openByStep = {};
  for (const t of top) if (!t.done && t.stepId) openByStep[t.stepId] = (openByStep[t.stepId] || 0) + 1;

  const patch = async (body, message) => {
    setBusy(true);
    try {
      const saved = await w(`entities/${e.id}`, { method: 'PATCH', body });
      res.setData((d) => ({ ...d, ...saved }));
      if (message) toast(message);
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const setIndex = (i) => {
    const finishing = i >= e.steps.length;
    patch({ stepIndex: i }, finishing ? 'All steps complete' : i > e.stepIndex ? `Now on: ${e.steps[i].name}` : null);
  };

  return (
    <div className="stack">
      <Link to="/" className="back"><Icon name="back" size={16} />Dashboard</Link>

      <header className="ent-hero" style={{ '--biz': e.color }}>
        <div className="biz-thumb ent-hero-thumb">
          {e.thumbUrl
            ? <img src={e.thumbUrl} alt="" />
            : <span className="ent-thumb-icon" aria-hidden="true"><Icon name={cat.icon} size={28} /></span>}
        </div>
        <div className="ent-hero-main">
          <div className="ent-hero-tags">
            <span className="ent-cat-inline"><Icon name={cat.icon} size={15} />{cat.label}</span>
            <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge>
            {e.dueDate && (
              <span className={`chip ${isOverdue(e.dueDate) && e.status !== 'done' ? 'is-late' : ''}`}>
                <Icon name="calendar" size={13} />Due {shortDate(e.dueDate)}
              </span>
            )}
          </div>
          <h1 className="order-no">{e.title}</h1>
          {e.description && <p className="muted prewrap ent-hero-desc">{e.description}</p>}
        </div>
        <div className="ent-hero-actions">
          {e.status === 'active' ? (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => patch({ status: 'done' }, 'Moved to Done workspaces')}>
              <Icon name="check" size={15} />Move to Done
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => patch({ status: 'active' }, 'Back in your workspace')}>Reopen</button>
          )}
          <button type="button" className="icon-btn icon-btn-box has-count" onClick={() => setDialog('notes')} aria-label={`Notes (${e.counts.notes})`} title="Notes and reminders">
            <Icon name="note" size={17} />{e.counts.notes > 0 && <span className="icon-count">{e.counts.notes}</span>}
          </button>
          <button type="button" className={`icon-btn icon-btn-box has-count ${tab === 'files' ? 'is-on' : ''}`} onClick={() => setParams({ tab: 'files' }, { replace: true })}
            aria-label={`Files (${e.fileList.length})`} title="Files">
            <Icon name="paperclip" size={17} />{e.fileList.length > 0 && <span className="icon-count">{e.fileList.length}</span>}
          </button>
          <button type="button" className="icon-btn icon-btn-box" onClick={() => setDialog('meeting')} aria-label="Schedule a meeting" title="Schedule a meeting">
            <Icon name="users" size={17} />
          </button>
          <button type="button" className={`icon-btn icon-btn-box ${showProgress ? 'is-on' : ''}`} onClick={() => setShowProgress(!showProgress)}
            aria-expanded={showProgress} aria-controls="progress" aria-label="Progress" title="Progress">
            <Icon name="chart" size={17} />
          </button>
          <Link to={`/w/${e.id}/edit`} className="icon-btn icon-btn-box" aria-label="Edit entry" title="Edit"><Icon name="edit" size={17} /></Link>
        </div>
      </header>

      {showProgress && <Progress e={e} top={top} doneTop={doneTop} />}

      {e.steps.length > 0
        ? <Stepper entity={e} openByStep={openByStep} onSetIndex={setIndex} busy={busy} />
        : e.category !== 'research' && (
          <p className="sub">
            No step line yet. <Link to={`/w/${e.id}/edit`} className="link">Add one</Link> to track stages like planning, build and launch.
          </p>
        )}

      {tabs.length > 1 && (
        <nav className="tabs" aria-label={`${cat.label} sections`}>
          {tabs.map((t) => (
            <button key={t.id} type="button" className={`tab ${tab === t.id ? 'is-active' : ''}`} aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setParams(t.id === 'tasks' ? {} : { tab: t.id }, { replace: true })}>
              <Icon name={t.icon} size={15} />{t.label}
              {t.count && counts[t.count] > 0 && <span className="dash-count">{counts[t.count]}</span>}
            </button>
          ))}
        </nav>
      )}

      {tab === 'tasks' && <Tasks entity={e} tasks={tasks} setTasks={setTasks} files={files} setFiles={setFiles} reload={res.reload} />}
      {tab === 'files' && <Files entity={e} files={files} setFiles={setFiles} tasks={tasks} />}
      {tab === 'papers' && <Papers entity={e} onCount={bump('papers')} />}
      {tab === 'schedule' && <Schedule entity={e} onCount={bump('slots')} />}
      {tab === 'cts' && <Cts entity={e} onCount={bump('cts')} />}

      {dialog === 'notes' && <NotesModal entity={e} onClose={() => setDialog(null)} onCount={bump('notes')} />}
      {dialog === 'meeting' && <MeetingModal initial={{ entityId: e.id }} onClose={() => setDialog(null)} />}
    </div>
  );
}
