import { useRef, useState } from 'react';
import { w } from '../api.js';
import { date, fileSize } from '../format.js';
import { Badge, Icon, toast } from '../ui.jsx';
import { deleteLocal, getLocal, newKey, putLocal } from './localFiles.js';
import { canView, fileKind, fileLink, fileWhere, tooBig } from './meta.js';

/**
 * Adds a file to an entry. The bytes stay on this device; the server only learns the name, type and size,
 * so tasks can link to it. Resolves with the saved record.
 */
export async function uploadFile(entityId, file) {
  const key = newKey();
  await putLocal({ key, entityId, name: file.name, blob: file, addedAt: Date.now() });
  try {
    return await w(`entities/${entityId}/files`, {
      method: 'POST', body: { name: file.name, mime: file.type, size: file.size, localKey: key },
    });
  } catch (e) {
    deleteLocal(key);
    throw e;
  }
}

/** Copies this device's copy of a file to the server. */
async function syncFile(f) {
  const rec = f.localKey && await getLocal(f.localKey);
  if (!rec) throw new Error(`${f.name} is not on this device`);
  return w(`files/${f.id}/data`, { method: 'PUT', blob: rec.blob });
}

const WHERE = {
  local: { label: 'On this device', tone: 'warn', hint: 'Only this browser has it. Sync to open it on other devices.' },
  big: { label: 'On this device only', tone: 'muted', hint: 'Too large to sync. It stays in this browser.' },
  synced: { label: 'Synced', tone: 'ok', hint: 'Saved on the server too.' },
  elsewhere: { label: 'On another device', tone: 'muted', hint: 'Added on another device and not synced yet.' },
};

/** PDFs, docs and slides for an entry. Tasks can point at these. */
export default function Files({ entity, files, setFiles, tasks }) {
  const input = useRef(null);
  const [uploading, setUploading] = useState(0);
  const [syncing, setSyncing] = useState(null); // { done, total } while "Sync files" runs
  const [inFlight, setInFlight] = useState(() => new Set()); // ids of files being synced right now
  const [dragging, setDragging] = useState(false);
  const [renaming, setRenaming] = useState(null);

  const upload = async (list) => {
    const picked = [...list];
    if (!picked.length) return;
    setUploading((n) => n + picked.length);
    for (const file of picked) {
      try {
        const saved = await uploadFile(entity.id, file);
        setFiles((l) => [saved, ...l]);
      } catch (e) {
        toast(e.message, 'danger');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const limit = entity.fileLimitMb;
  const whereOf = (f) => (fileWhere(f) === 'local' && tooBig(f, limit) ? 'big' : fileWhere(f));
  const toSync = files.filter((f) => whereOf(f) === 'local');
  const mark = (id, on) => setInFlight((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  /** Syncs one file; resolves true if it worked. */
  const syncOne = async (f) => {
    mark(f.id, true);
    try {
      const saved = await syncFile(f);
      setFiles((l) => l.map((x) => (x.id === f.id ? saved : x)));
      return true;
    } catch (e) {
      toast(e.message, 'danger');
      return false;
    } finally {
      mark(f.id, false);
    }
  };

  const sync = async () => {
    const list = toSync.filter((f) => !inFlight.has(f.id));
    setSyncing({ done: 0, total: list.length });
    let ok = 0;
    for (const f of list) {
      if (await syncOne(f)) ok += 1;
      setSyncing((s) => ({ ...s, done: s.done + 1 }));
    }
    setSyncing(null);
    if (ok) toast(`Synced ${ok} file${ok > 1 ? 's' : ''}`);
  };

  const rename = async (f, name) => {
    setRenaming(null);
    if (!name.trim() || name.trim() === f.name) return;
    try {
      const saved = await w(`files/${f.id}`, { method: 'PATCH', body: { name: name.trim() } });
      setFiles((l) => l.map((x) => (x.id === f.id ? saved : x)));
    } catch (e) { toast(e.message, 'danger'); }
  };

  const remove = async (f, uses) => {
    if (!window.confirm(`Delete ${f.name}?${uses ? ` ${uses} task${uses > 1 ? 's' : ''} will lose the link to it.` : ''}`)) return;
    try {
      await w(`files/${f.id}`, { method: 'DELETE' });
      if (f.localKey) deleteLocal(f.localKey);
      setFiles((l) => l.filter((x) => x.id !== f.id));
    } catch (e) { toast(e.message, 'danger'); }
  };

  const usesOf = (f) => tasks.filter((t) => t.fileId === f.id);

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Files <span className="dash-count">{files.length}</span></h3>
          <p className="sub">Any kind of file, kept on this device. Sync to open them on your other devices (up to {limit} MB each).</p>
        </div>
        <div className="files-tools">
          <button className="btn btn-ghost btn-sm" onClick={sync} disabled={!toSync.length || Boolean(syncing)}
            title={toSync.length ? `Copy ${toSync.length} file${toSync.length > 1 ? 's' : ''} from this device to the server` : 'Everything on this device is synced'}>
            <Icon name="upload" size={15} />
            {syncing ? `Syncing ${syncing.done + 1} of ${syncing.total}…` : `Sync files${toSync.length ? ` (${toSync.length})` : ''}`}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => input.current.click()}><Icon name="plus" size={15} />Add files</button>
        </div>
        <input ref={input} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      </div>

      <div className={`dropzone ${dragging ? 'is-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}>
        {uploading > 0
          ? <span><span className="spinner" /> Saving {uploading} file{uploading > 1 ? 's' : ''}…</span>
          : <span><Icon name="paperclip" size={16} /> Drop files here. They stay on this device until you sync.</span>}
      </div>

      {files.length === 0 && !uploading && <p className="empty">No files yet.</p>}

      <ul className="record-list">
        {files.map((f) => {
          const uses = usesOf(f);
          const where = WHERE[whereOf(f)];
          const link = fileLink(f);
          return (
            <li key={f.id} className={`record ${link ? '' : 'is-away'}`}>
              <div className="record-row">
                <span className="file-kind" data-kind={fileKind(f)}>{fileKind(f)}</span>
                {renaming === f.id ? (
                  <input className="input" defaultValue={f.name} autoFocus maxLength={200} aria-label="File name"
                    onBlur={(e) => rename(f, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} />
                ) : (
                  <a className="record-main" {...link} aria-disabled={!link} title={link ? `${canView(f) ? 'Open' : 'Download'} ${f.name}` : where.hint}>
                    <span className="strong record-title">{f.name}</span>
                    <span className="sub">
                      {fileSize(f.size)} · {date(f.createdAt)}
                      {uses.length > 0 && ` · linked to ${uses.length} task${uses.length > 1 ? 's' : ''}`}
                    </span>
                  </a>
                )}
                <span title={where.hint}><Badge tone={where.tone}>{where.label}</Badge></span>
                <div className="task-actions is-shown">
                  {whereOf(f) === 'local' && (inFlight.has(f.id)
                    ? <span className="icon-btn" role="status" aria-label={`Syncing ${f.name}`} title="Syncing…"><span className="spinner" /></span>
                    : (
                      <button type="button" className="icon-btn" onClick={async () => { if (await syncOne(f)) toast(`Synced ${f.name}`); }}
                        disabled={Boolean(syncing)} aria-label={`Sync ${f.name}`} title="Sync this file">
                        <Icon name="upload" size={16} />
                      </button>
                    ))}
                  {link && (
                    <a className="icon-btn" href={f.localUrl || `/api/w/files/${f.id}?download`} download={f.name}
                      aria-label={`Download ${f.name}`} title="Download"><Icon name="download" size={16} /></a>
                  )}
                  <button type="button" className="icon-btn" onClick={() => setRenaming(f.id)} aria-label={`Rename ${f.name}`} title="Rename"><Icon name="edit" size={16} /></button>
                  <button type="button" className="icon-btn danger" onClick={() => remove(f, uses.length)} aria-label={`Delete ${f.name}`} title="Delete"><Icon name="trash" size={16} /></button>
                </div>
              </div>
              {uses.length > 0 && (
                <ul className="file-uses">
                  {uses.map((t) => (
                    <li key={t.id} className={t.done ? 'is-done' : ''}>
                      <Icon name={t.parentId ? 'subtask' : 'check'} size={13} />{t.title}{t.fileRef && <span className="chip">{t.fileRef}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
