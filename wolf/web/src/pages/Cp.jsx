import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { w } from '../api.js';
import { ago } from '../format.js';
import { useAsync } from '../useAsync.js';
import { ErrorNote, Field, Icon, Loading, Modal, toast } from '../ui.jsx';
import { Heatmap, RatingColumns, RatingLine, TagBars } from '../cp/Charts.jsx';
import Contests from '../cp/Contests.jsx';
import { PLATFORMS, cfRank, tzOffset } from '../cp/meta.js';
import Problems from '../cp/Problems.jsx';
import Topics from '../cp/Topics.jsx';
import Upcoming from '../cp/Upcoming.jsx';
import { today } from '../workspace/meta.js';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'chart' },
  { id: 'problems', label: 'Problems', icon: 'code' },
  { id: 'contests', label: 'Contests', icon: 'trophy' },
  { id: 'learning', label: 'Learning', icon: 'book' },
  { id: 'upcoming', label: 'Upcoming', icon: 'calendar' },
];
const NO_FILTER = { status: '', platform: '', tag: '', q: '' };

function SettingsModal({ settings, onClose, onSaved }) {
  const [handle, setHandle] = useState(settings.cfHandle);
  const [goal, setGoal] = useState(String(settings.dailyGoal));
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      onSaved(await w('cp/settings', { method: 'PUT', body: { cfHandle: handle.trim(), dailyGoal: Number(goal) || 0 } }));
      onClose();
    } catch (e2) { setErr(e2); }
  };
  return (
    <Modal title="CP settings" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Codeforces handle" hint="Used to import your solved problems and rated contests. Leave empty to skip.">
          <input className="input" value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={24} placeholder="tourist" autoFocus />
        </Field>
        <Field label="Daily goal" hint="Problems a day. The streak counts days with at least one solve.">
          <input className="input tnum" type="number" min="0" max="50" value={goal} onChange={(e) => setGoal(e.target.value)} />
        </Field>
        <ErrorNote error={err} />
        <div className="record-form-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm">Save</button>
        </div>
      </form>
    </Modal>
  );
}

function Kpi({ label, value, sub, onClick, children }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`kpi cp-kpi ${onClick ? 'is-btn' : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value tnum">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
      {children}
    </Tag>
  );
}

function Overview({ s, openProblems }) {
  const platforms = [...new Set(s.history.map((h) => h.platform))];
  const [pf, setPf] = useState(platforms.includes('codeforces') ? 'codeforces' : platforms[0]);
  const shown = platforms.includes(pf) ? pf : platforms[0];
  return (
    <div className="cp-overview">
      <section className="panel">
        <div className="panel-head"><h3>Practice</h3><span className="sub">Problems solved per day</span></div>
        <Heatmap days={s.days} today={s.today} />
      </section>
      <div className="cp-two">
        <section className="panel">
          <div className="panel-head"><h3>Solved by tag</h3><span className="sub">Click a tag to see its problems</span></div>
          <TagBars items={s.tags} total={s.solved} onPick={(tag) => openProblems({ ...NO_FILTER, status: 'solved', tag })} />
        </section>
        <section className="panel">
          <div className="panel-head"><h3>Solved by difficulty</h3><span className="sub">Problem rating</span></div>
          <RatingColumns items={s.ratings} />
        </section>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h3>Rating</h3>
          {platforms.length > 1 && (
            <div className="segmented" role="tablist" aria-label="Platform">
              {platforms.map((p) => (
                <button key={p} role="tab" aria-selected={shown === p} className={shown === p ? 'is-on' : ''} onClick={() => setPf(p)}>{PLATFORMS[p]?.label || p}</button>
              ))}
            </div>
          )}
        </div>
        <RatingLine points={s.history.filter((h) => h.platform === shown)} platform={shown} />
      </section>
    </div>
  );
}

/** Competitive programming: practice, contests, learning. */
export default function Cp() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'overview';
  const setTab = (id) => setParams(id === 'overview' ? {} : { tab: id }, { replace: true });
  const [filter, setFilter] = useState(NO_FILTER);
  const summary = useAsync(() => w(`cp/summary?today=${today()}`), []);
  const settings = useAsync(() => w('cp/settings'), []);
  const [showSettings, setShowSettings] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [bump, setBump] = useState(0); // remounts lists after an import
  const s = summary.data;
  const cf = s?.current.find((c) => c.platform === 'codeforces');

  const openProblems = (f) => { setFilter(f); setTab('problems'); };
  const sync = async () => {
    if (!settings.data?.cfHandle) return setShowSettings(true);
    setSyncing(true);
    try {
      const r = await w('cp/sync/codeforces', { method: 'POST', body: { tz: tzOffset() } });
      settings.setData((d) => ({ ...d, lastSync: r.lastSync }));
      toast(r.newProblems || r.newContests || r.newSolved
        ? `Imported ${r.newSolved} new solves, ${r.newProblems} new problems, ${r.newContests} contests`
        : 'Already up to date');
      summary.reload();
      setBump((n) => n + 1);
    } catch (e) {
      toast(e.message, 'danger');
    } finally {
      setSyncing(false);
    }
  };

  const goalPct = s && s.goal ? Math.min(100, (s.solvedToday / s.goal) * 100) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Competitive programming</h1>
          <p className="muted">
            Practice, contests and what to learn next.
            {settings.data?.cfHandle && <> Codeforces: <a className="link" href={`https://codeforces.com/profile/${settings.data.cfHandle}`} target="_blank" rel="noreferrer">{settings.data.cfHandle}</a>
              {settings.data.lastSync && <span className="sub"> · synced {ago(settings.data.lastSync)}</span>}</>}
          </p>
        </div>
        <div className="files-tools">
          <button className="btn btn-ghost btn-sm" onClick={sync} disabled={syncing}>
            {syncing ? <><span className="spinner" />Importing…</> : <><Icon name="download" size={15} />{settings.data?.cfHandle ? 'Sync Codeforces' : 'Connect Codeforces'}</>}
          </button>
          <button className="icon-btn icon-btn-box" onClick={() => setShowSettings(true)} aria-label="CP settings" title="Settings"><Icon name="edit" size={16} /></button>
        </div>
      </div>

      {summary.loading && !s && <Loading />}
      <ErrorNote error={summary.error} onRetry={summary.reload} />

      {s && (
        <div className="cp-kpis">
          <Kpi label="Today" value={<>{s.solvedToday}<span className="kpi-of">/{s.goal}</span></>} sub={s.goal ? (s.solvedToday >= s.goal ? 'Goal reached' : `${s.goal - s.solvedToday} to go`) : 'No daily goal'}>
            {s.goal > 0 && <span className="progress cp-goal" role="img" aria-label={`${s.solvedToday} of ${s.goal} today`}><span style={{ width: `${goalPct}%` }} /></span>}
          </Kpi>
          <Kpi label="Streak" value={<>{s.streak}<span className="kpi-of"> {s.streak === 1 ? 'day' : 'days'}</span></>} sub={`Best ${s.bestStreak}`} />
          <Kpi label="Last 7 days" value={s.week} sub="solved" />
          <Kpi label="Solved" value={s.solved} sub={s.platforms.map((p) => `${PLATFORMS[p.platform]?.short || p.platform} ${p.count}`).join(' · ') || 'all time'}
            onClick={() => openProblems({ ...NO_FILTER, status: 'solved' })} />
          <Kpi label="Upsolve queue" value={s.upsolve} sub={s.upsolve ? 'from contests' : 'All caught up'} onClick={() => openProblems({ ...NO_FILTER, status: 'upsolve' })} />
          <Kpi label="Codeforces rating" value={cf ? <span className="cp-rating">{cf.rating}</span> : '—'}
            sub={cf ? <><i className="rank-dot" style={{ background: cfRank(cf.rating).dot }} />{cfRank(cf.rating).name} · max {cf.max}</> : 'Sync to see it'} />
        </div>
      )}

      <nav className="tabs" aria-label="CP sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`tab ${tab === t.id ? 'is-active' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={15} />{t.label}
            {t.id === 'problems' && s?.upsolve > 0 && <span className="dash-count" title="To upsolve">{s.upsolve}</span>}
          </button>
        ))}
      </nav>

      {tab === 'overview' && s && <Overview s={s} openProblems={openProblems} />}
      {tab === 'problems' && <Problems key={bump} filter={filter} setFilter={setFilter} summary={s} onChanged={summary.reload} />}
      {tab === 'contests' && <Contests key={bump} onChanged={summary.reload} onUpsolve={() => openProblems({ ...NO_FILTER, status: 'upsolve' })} />}
      {tab === 'learning' && <Topics allTags={s?.allTags || []} onPractice={(tag) => openProblems({ ...NO_FILTER, status: 'solved', tag })} />}
      {tab === 'upcoming' && <Upcoming onChanged={summary.reload} />}

      {showSettings && settings.data && (
        <SettingsModal settings={settings.data} onClose={() => setShowSettings(false)}
          onSaved={(d) => { settings.setData(d); summary.reload(); toast('Settings saved'); }} />
      )}
    </div>
  );
}
