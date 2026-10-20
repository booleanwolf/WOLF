import { useEffect, useRef, useState } from 'react';
import { w } from '../api.js';
import { Icon, toast } from '../ui.jsx';
import { uploadFile } from './Files.jsx';
import { PRIORITY, canView, fileKind, fileLink, isOverdue, isToday, shortDate } from './meta.js';

function AddTask({ placeholder, onAdd, steps, defaultStep, compact, autoFocus }) {
  const [title, setTitle] = useState('');
  const [stepId, setStepId] = useState(defaultStep || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => setStepId(defaultStep || ''), [defaultStep]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onAdd({ title: title.trim(), stepId: stepId || null });
      setTitle('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={`add-task ${compact ? 'is-compact' : ''}`} onSubmit={submit}>
      <Icon name="plus" size={16} />
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder}
        aria-label={placeholder} maxLength={300} autoFocus={autoFocus} />
      {steps?.length > 0 && (
        <select className="input select add-task-step" value={stepId} onChange={(e) => setStepId(e.target.value)} aria-label="Step">
          <option value="">No step</option>
          {steps.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <button className="btn btn-ghost btn-sm" disabled={busy || !title.trim()}>Add</button>
    </form>
  );
}

function Check({ done, onChange, label }) {
  return (
    <button type="button" className={`task-check ${done ? 'is-done' : ''}`} onClick={() => onChange(!done)}
      role="checkbox" aria-checked={done} aria-label={label}>
      {done && <Icon name="check" size={13} />}
    </button>
  );
}

/**
 * A task's ticks: one box per time it has to be done (3 for academic work by default).
 * Ticking a box ticks it and those before it; unticking a box unticks it and those after it.
 */
function Ticks({ task, onChange }) {
  const reps = task.reps || 1;
  if (reps === 1) {
    return <Check done={task.done} onChange={(done) => onChange({ done })} label={`Mark "${task.title}" ${task.done ? 'not done' : 'done'}`} />;
  }
  const n = Math.min(task.repsDone || 0, reps);
  return (
    <span className="ticks" role="group" aria-label={`"${task.title}": done ${n} of ${reps} times`}>
      {Array.from({ length: reps }, (_, i) => (
        <button key={i} type="button" className={`task-check ${i < n ? 'is-done' : ''}`} onClick={() => onChange({ repsDone: i < n ? i : i + 1 })}
          role="checkbox" aria-checked={i < n} aria-label={`Time ${i + 1} of ${reps}`}>
          {i < n && <Icon name="check" size={12} />}
        </button>
      ))}
    </span>
  );
}

/** How many ticks a task needs (1–20). Saves on blur or Enter, so typing "12" never passes through 1. */
function RepsInput({ task, onSave, compact }) {
  const [v, setV] = useState(String(task.reps || 1));
  useEffect(() => setV(String(task.reps || 1)), [task.reps]);
  const commit = () => {
    const n = Math.max(1, Math.min(20, Math.round(Number(v)) || 1));
    setV(String(n));
    if (n !== task.reps) onSave({ reps: n });
  };
  return (
    <label className={`inv-input ${compact ? 'reps-compact' : ''}`} title="How many times this has to be done">{!compact && 'Times to do'}
      <input className="input" type="number" inputMode="numeric" min={1} max={20} value={v} aria-label="Times to do"
        onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    </label>
  );
}

function DueChip({ date, done }) {
  if (!date) return null;
  const tone = done ? '' : isOverdue(date) ? 'is-late' : isToday(date) ? 'is-today' : '';
  return <span className={`chip ${tone}`}><Icon name="calendar" size={13} />{isToday(date) ? 'Today' : shortDate(date)}</span>;
}

/** Opens the linked file, at the referenced page for PDFs. */
function FileChip({ task, files }) {
  const f = task.fileId && files.find((x) => x.id === task.fileId);
  if (!f) return null;
  const link = fileLink(f, task.fileRef);
  const label = <><Icon name="paperclip" size={13} />{task.fileRef ? `${task.fileRef} · ` : ''}<span className="chip-file-name">{f.name}</span></>;
  // Not on this device and not synced: show the link, but it cannot open here.
  if (!link) return <span className="chip chip-file is-away" title={`${f.name} is on another device. Sync it there to open it here.`}>{label}</span>;
  return <a className="chip chip-file" {...link} title={`${canView(f) ? 'Open' : 'Download'} ${f.name}`}>{label}</a>;
}

/** Pick one of the entry's files (or upload one) and say where in it to look. */
function FileLink({ task, files, onUpload, onSave, compact }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (v) => {
    if (v === 'upload') return input.current.click();
    onSave({ fileId: v ? Number(v) : null, ...(v ? {} : { fileRef: '' }) });
  };
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const saved = await onUpload(file);
      onSave({ fileId: saved.id });
    } catch (e) { toast(e.message, 'danger'); } finally { setBusy(false); }
  };
  return (
    <div className={`file-link ${compact ? 'is-compact' : ''}`}>
      <label className="inv-input">{!compact && 'File'}
        <select className="input select" value={busy ? 'busy' : task.fileId || ''} onChange={(e) => pick(e.target.value)} aria-label="Linked file" disabled={busy}>
          <option value="">No file</option>
          {busy && <option value="busy">Uploading…</option>}
          {files.map((f) => <option key={f.id} value={f.id}>{fileKind(f)}: {f.name}</option>)}
          <option value="upload">Upload a file…</option>
        </select>
      </label>
      {task.fileId && (
        <label className="inv-input">{!compact && 'Where'}
          <InlineText value={task.fileRef || ''} onSave={(fileRef) => onSave({ fileRef })} placeholder="Slide 4, p. 12" label="Where in the file" maxLength={60} />
        </label>
      )}
      <input ref={input} type="file" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

/** Edits a text field in place and saves on blur. */
function InlineText({ value, onSave, multiline, className, placeholder, label, maxLength = 300 }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v.trim() !== value) onSave(v.trim()); };
  const props = {
    className: `input ${className || ''}`, value: v, placeholder, 'aria-label': label,
    onChange: (e) => setV(e.target.value), onBlur: commit,
  };
  return multiline
    ? <textarea rows={3} {...props} maxLength={10000} />
    : <input {...props} maxLength={maxLength} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setV(value); }} />;
}

function TaskItem({ task, subtasks, steps, stepNames, showStep, expanded, editing, onToggleExpand, onEdit, api, files, prev, next }) {
  const doneSubs = subtasks.filter((s) => s.done).length;
  const stepName = stepNames[task.stepId];
  return (
    <li className={`task ${task.done ? 'is-done' : ''} ${expanded ? 'is-open' : ''}`}>
      <div className="task-row">
        <Ticks task={task} onChange={(patch) => api.update(task, patch)} />
        <button type="button" className="task-main" onClick={onToggleExpand} aria-expanded={expanded}>
          <span className="task-title">
            {task.priority === 'high' && <Icon name="flag" size={14} />}
            {task.title}
          </span>
          <span className="task-meta">
            {showStep && stepName && <span className="chip">{stepName}</span>}
            <DueChip date={task.dueDate} done={task.done} />
            {subtasks.length > 0 && <span className="chip"><Icon name="subtask" size={13} />{doneSubs}/{subtasks.length}</span>}
            {task.notes && <span className="chip" title="Has notes"><Icon name="note" size={13} /></span>}
          </span>
        </button>
        <FileChip task={task} files={files} />
        <div className="task-actions">
          <button type="button" className={`icon-btn ${editing ? 'is-on' : ''}`} onClick={onEdit} aria-pressed={editing} aria-label={`Edit "${task.title}"`} title="Edit"><Icon name="edit" size={16} /></button>
          <button type="button" className="icon-btn" disabled={!prev} onClick={() => api.move(task, prev)} aria-label="Move up" title="Move up"><Icon name="up" size={16} /></button>
          <button type="button" className="icon-btn" disabled={!next} onClick={() => api.move(task, next)} aria-label="Move down" title="Move down"><Icon name="down" size={16} /></button>
          <button type="button" className="icon-btn danger" onClick={() => api.remove(task)} aria-label={`Delete "${task.title}"`} title="Delete"><Icon name="trash" size={16} /></button>
        </div>
      </div>

      {/* Due date, step and priority already show as chips on the row; only notes need the extra space. */}
      {expanded && !editing && task.notes && (
        <div className="task-detail is-view">
          <p className="prewrap task-notes">{task.notes}</p>
        </div>
      )}

      {expanded && editing && (
        <div className="task-detail">
          <InlineText value={task.title} onSave={(title) => title && api.update(task, { title })} label="Task title" className="task-title-input" />
          <div className="task-fields">
            <label className="inv-input">Due
              <input className="input" type="date" value={task.dueDate || ''} onChange={(e) => api.update(task, { dueDate: e.target.value || null })} />
            </label>
            <label className="inv-input">Priority
              <select className="input select" value={task.priority} onChange={(e) => api.update(task, { priority: e.target.value })}>
                {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <RepsInput task={task} onSave={(patch) => api.update(task, patch)} />
            {steps.length > 0 && (
              <label className="inv-input">Step
                <select className="input select" value={task.stepId || ''} onChange={(e) => api.update(task, { stepId: e.target.value || null })}>
                  <option value="">No step</option>
                  {steps.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <FileLink task={task} files={files} onUpload={api.upload} onSave={(patch) => api.update(task, patch)} />
          <InlineText value={task.notes} onSave={(notes) => api.update(task, { notes })} multiline placeholder="Notes" label="Notes" />
          <div className="row-end"><button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}><Icon name="check" size={15} />Done editing</button></div>
        </div>
      )}

      {(subtasks.length > 0 || expanded) && (
        <ul className="subtasks">
          {subtasks.map((s, i) => (
            <li key={s.id} className={`subtask ${s.done ? 'is-done' : ''}`}>
              <Ticks task={s} onChange={(patch) => api.update(s, patch)} />
              {editing
                ? <InlineText value={s.title} onSave={(title) => title && api.update(s, { title })} label="Subtask title" className="subtask-input" />
                : <span className="subtask-title">{s.title}</span>}
              <DueChip date={s.dueDate} done={s.done} />
              {!editing && <FileChip task={s} files={files} />}
              {editing && <RepsInput compact task={s} onSave={(patch) => api.update(s, patch)} />}
              {editing && <FileLink compact task={s} files={files} onUpload={api.upload} onSave={(patch) => api.update(s, patch)} />}
              {editing && (
                <div className="task-actions is-shown">
                  <button type="button" className="icon-btn" disabled={i === 0} onClick={() => api.move(s, subtasks[i - 1])} aria-label="Move subtask up"><Icon name="up" size={15} /></button>
                  <button type="button" className="icon-btn" disabled={i === subtasks.length - 1} onClick={() => api.move(s, subtasks[i + 1])} aria-label="Move subtask down"><Icon name="down" size={15} /></button>
                  <button type="button" className="icon-btn danger" onClick={() => api.remove(s)} aria-label={`Delete "${s.title}"`}><Icon name="trash" size={15} /></button>
                </div>
              )}
            </li>
          ))}
          {expanded && (
            <li><AddTask compact placeholder="Add a subtask" onAdd={(b) => api.add({ title: b.title, parentId: task.id })} /></li>
          )}
        </ul>
      )}
    </li>
  );
}

export default function Tasks({ entity, tasks, setTasks, files, setFiles, reload }) {
  const [filter, setFilter] = useState('all'); // 'all' | step id | 'none'
  const [showFilter, setShowFilter] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const steps = entity.steps;
  const stepNames = Object.fromEntries(steps.map((s) => [s.id, s.name]));
  const top = tasks.filter((t) => !t.parentId);
  const subsOf = (id) => tasks.filter((t) => t.parentId === id);
  const visible = top.filter((t) => filter === 'all' || (filter === 'none' ? !t.stepId : t.stepId === filter));
  const open = visible.filter((t) => !t.done);
  const done = visible.filter((t) => t.done);

  const fail = (e) => { toast(e.message, 'danger'); reload(); };
  const api = {
    upload: async (file) => {
      const saved = await uploadFile(entity.id, file);
      setFiles((l) => [saved, ...l]);
      return saved;
    },
    add: async (body) => {
      try {
        const t = await w(`entities/${entity.id}/tasks`, { method: 'POST', body });
        setTasks((list) => [...list, t]);
      } catch (e) { toast(e.message, 'danger'); throw e; }
    },
    update: async (task, patch) => {
      // Optimistic: show the change now, reconcile with the server's copy. Ticks and done move together.
      const local = { ...patch };
      if ('reps' in patch || 'repsDone' in patch || 'done' in patch) {
        const reps = patch.reps ?? task.reps;
        const repsDone = 'repsDone' in patch ? Math.min(patch.repsDone, reps) : 'done' in patch ? (patch.done ? reps : 0) : Math.min(task.repsDone, reps);
        Object.assign(local, { reps, repsDone, done: repsDone >= reps });
      }
      // Finishing a task finishes its subtasks too.
      const finishing = local.done === true && !task.done;
      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, ...local }
        : finishing && t.parentId === task.id ? { ...t, done: true, repsDone: t.reps } : t)));
      try {
        const t = await w(`tasks/${task.id}`, { method: 'PATCH', body: patch });
        setTasks((list) => list.map((x) => (x.id === t.id ? t : x)));
        if (t.done && !task.done && t.reps > 1) toast(`Done all ${t.reps} times`);
      } catch (e) { fail(e); }
    },
    // Swap with the neighbour in the list on screen, even if hidden siblings sit between them.
    move: async (task, neighbour) => {
      const group = tasks.filter((t) => t.parentId === task.parentId).sort((a, b) => a.position - b.position || a.id - b.id);
      const ids = group.map((t) => t.id);
      const i = ids.indexOf(task.id);
      const j = ids.indexOf(neighbour.id);
      [ids[i], ids[j]] = [ids[j], ids[i]];
      const pos = Object.fromEntries(ids.map((x, k) => [x, k + 1]));
      setTasks((list) => list.map((t) => (t.id in pos ? { ...t, position: pos[t.id] } : t)).sort((a, b) => a.position - b.position || a.id - b.id));
      try {
        await w(`entities/${entity.id}/task-order`, { method: 'PUT', body: { parentId: task.parentId, ids } });
      } catch (e) { fail(e); }
    },
    remove: async (task) => {
      const subs = subsOf(task.id).length;
      if (!window.confirm(`Delete "${task.title}"${subs ? ` and its ${subs} subtask${subs > 1 ? 's' : ''}` : ''}?`)) return;
      setTasks((list) => list.filter((t) => t.id !== task.id && t.parentId !== task.id));
      try { await w(`tasks/${task.id}`, { method: 'DELETE' }); } catch (e) { fail(e); }
    },
  };

  // Move buttons follow the order the server keeps, among siblings shown in the same list.
  const renderList = (list) => list.map((t, i) => (
    <TaskItem key={t.id} task={t} subtasks={subsOf(t.id)} steps={steps} stepNames={stepNames} showStep={filter === 'all'}
      expanded={expanded === t.id} editing={editing === t.id}
      onToggleExpand={() => { setExpanded(expanded === t.id ? null : t.id); setEditing(null); }}
      onEdit={() => { if (editing === t.id) setEditing(null); else { setExpanded(t.id); setEditing(t.id); } }}
      api={api} files={files} prev={list[i - 1]} next={list[i + 1]} />
  ));

  const current = steps[entity.stepIndex]?.id;

  return (
    <section className="panel tasks-panel">
      <div className="panel-head">
        <h3>Tasks <span className="dash-count">{top.filter((t) => !t.done).length} open</span></h3>
        {steps.length > 0 && (
          <div className="tasks-tools">
            {filter !== 'all' && !showFilter && (
              <button type="button" className="chip chip-btn" onClick={() => setFilter('all')} aria-label="Clear step filter">
                {filter === 'none' ? 'No step' : stepNames[filter]}<Icon name="x" size={12} />
              </button>
            )}
            <button type="button" className={`icon-btn ${showFilter ? 'is-on' : ''} ${filter !== 'all' ? 'has-dot' : ''}`}
              onClick={() => setShowFilter(!showFilter)} aria-expanded={showFilter} aria-label="Filter tasks by step" title="Filter by step">
              <Icon name="filter" size={17} />
            </button>
          </div>
        )}
      </div>

      {steps.length > 0 && showFilter && (
        <div className="chips-filter" role="tablist" aria-label="Filter tasks by step">
          <button role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>All</button>
          {steps.map((s) => (
            <button key={s.id} role="tab" aria-selected={filter === s.id} className={`${filter === s.id ? 'is-on' : ''} ${s.id === current ? 'is-current' : ''}`}
              onClick={() => setFilter(s.id)}>{s.name}</button>
          ))}
          <button role="tab" aria-selected={filter === 'none'} className={filter === 'none' ? 'is-on' : ''} onClick={() => setFilter('none')}>No step</button>
        </div>
      )}

      <AddTask placeholder="Add a task" steps={steps} onAdd={api.add}
        defaultStep={filter !== 'all' && filter !== 'none' ? filter : filter === 'all' ? current : ''} />

      {open.length > 0 ? <ul className="task-list">{renderList(open)}</ul>
        : <p className="empty">{done.length ? 'Everything here is done.' : 'No tasks yet. Add the first one above.'}</p>}

      {done.length > 0 && (
        <div className="done-group">
          <button type="button" className="done-toggle" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
            <Icon name="chevron" size={15} />Completed ({done.length})
          </button>
          {showDone && <ul className="task-list">{renderList(done)}</ul>}
        </div>
      )}
    </section>
  );
}
