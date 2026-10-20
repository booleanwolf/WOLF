import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, cx, cxMedia, w } from '../api.js';
import { money } from '../format.js';
import { useAsync } from '../useAsync.js';
import { ErrorNote, Icon, Loading, Switch } from '../ui.jsx';
import EntityTile from '../workspace/EntityTile.jsx';
import { ComingUpColumn, TodayColumn, useAgenda } from '../workspace/TodayPanel.jsx';
import { useDayTimeline } from '../workspace/DayView.jsx';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Per-business tile details that live in the UI (thumbnail, live figures).
const TILE = {
  clutchx3d: {
    thumb: cxMedia('/media/products/seed-custom-statue.webp'),
    logo: '/brands/clutchx3d-mark.svg',
    stats: () => cx('stats'),
    // The tile only fits a line: what needs you first, else what is in production.
    summary: (s) => {
      const todo = (s.awaitingQuote ?? 0) + (s.awaitingVerification ?? 0);
      return todo ? { text: `${todo} to handle`, alert: true } : { text: `${s.inProduction} in production · ${money(s.revenue30d)}` };
    },
  },
};

function BusinessTile({ m }) {
  const t = TILE[m.id] || {};
  const stats = useAsync(() => (m.connected && t.stats ? t.stats() : Promise.resolve(null)), [m.id, m.connected]);
  const sum = stats.data && t.summary?.(stats.data);
  return (
    <Link to={`/b/${m.id}`} className={`biz-tile ent-tile ${m.connected ? '' : 'is-inactive'}`} style={{ '--biz': m.color }} title={m.description}>
      <div className="biz-thumb">
        {t.thumb && m.connected && <img src={t.thumb} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        {t.logo && (
          <span className="biz-logo">
            <img src={t.logo} alt="" onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }} />
          </span>
        )}
      </div>
      <div className="ent-tile-body">
        <h2 className="ent-title">{m.name}</h2>
        <p className="ent-meta">
          {!m.connected ? <span>Inactive</span> : sum ? <span className={sum.alert ? 'is-alert' : ''}>{sum.text}</span> : <span>Business</span>}
        </p>
      </div>
    </Link>
  );
}

export default function Home({ user }) {
  const [showArchived, setShowArchived] = useState(false);
  const [showDone, setShowDone] = useState(() => { try { return localStorage.getItem('wolf-show-done') === '1'; } catch { return false; } });
  const mods = useAsync(() => api('/api/modules'), []);
  const work = useAsync(() => w('entities'), []);
  const ag = useAgenda();
  const day = useDayTimeline(ag.res.reload);

  const toggleDone = () => {
    setShowDone(!showDone);
    try { localStorage.setItem('wolf-show-done', showDone ? '0' : '1'); } catch {}
  };
  // Finished workspaces leave the main grid for their own Done section.
  const entities = (work.data || []).filter((e) => e.status !== 'done' && (showArchived || e.status !== 'archived'));
  const done = (work.data || []).filter((e) => e.status === 'done');
  const archivedCount = (work.data || []).filter((e) => e.status === 'archived').length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{greeting()}, {user.username}</h1>
          <p className="muted">Everything you run, research and study, in one place.</p>
        </div>
      </div>

      <div className="dash">
        <TodayColumn ag={ag} onTimeline={() => day.open()} />

        <div className="dash-main">
          <section className="dash-section" aria-label="Workspace">
            <div className="dash-section-head">
              <h2>Workspace{work.data && <span className="dash-count">{entities.length}</span>}</h2>
              <div className="dash-tools">
                {archivedCount > 0 && <Switch checked={showArchived} onChange={setShowArchived} label={`Archived (${archivedCount})`} />}
                <Link to="/w/new" className="btn btn-ghost btn-sm"><Icon name="plus" size={15} />New</Link>
              </div>
            </div>
            {work.loading && !work.data && <Loading />}
            <ErrorNote error={work.error} onRetry={work.reload} />
            {work.data && (
              <div className="ent-grid">
                {entities.map((e) => <EntityTile key={e.id} e={e} />)}
                <Link to="/w/new" className="biz-tile ent-tile ent-new">
                  <span className="biz-empty-plus" aria-hidden="true">+</span>
                  <span>New</span>
                </Link>
              </div>
            )}
          </section>

          {done.length > 0 && (
            <section className="dash-section" aria-label="Done workspaces">
              <div className="dash-section-head">
                <button type="button" className="dash-fold" onClick={toggleDone} aria-expanded={showDone} aria-controls="done-grid">
                  <Icon name="chevron" size={16} />
                  <h2>Done<span className="dash-count">{done.length}</span></h2>
                </button>
              </div>
              {showDone && <div className="ent-grid" id="done-grid">{done.map((e) => <EntityTile key={e.id} e={e} />)}</div>}
            </section>
          )}

          <section className="dash-section" aria-label="Businesses">
            <div className="dash-section-head">
              <h2>Businesses{mods.data && <span className="dash-count">{mods.data.length}</span>}</h2>
            </div>
            {mods.loading && !mods.data && <Loading />}
            <ErrorNote error={mods.error} onRetry={mods.reload} />
            {mods.data && (
              <div className="ent-grid">{mods.data.map((m) => <BusinessTile key={m.id} m={m} />)}</div>
            )}
          </section>
        </div>

        <ComingUpColumn ag={ag} />
      </div>
      {ag.modal}
      {day.modal}
    </div>
  );
}
