import { useState } from 'react';
import { w } from '../api.js';
import { useAsync } from '../useAsync.js';
import { Badge, ErrorNote, Icon, Loading, toast } from '../ui.jsx';
import { localDate } from '../workspace/meta.js';
import { countdown, minutes } from './meta.js';

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Codeforces contests that have not started. Planning one puts it on the calendar and the dashboard. */
export default function Upcoming({ onChanged }) {
  const res = useAsync(() => w('cp/upcoming'), []);
  const [busy, setBusy] = useState(null);

  const plan = async (c) => {
    setBusy(c.extId);
    const start = new Date(c.start);
    try {
      await w('cp/contests', {
        method: 'POST',
        body: { platform: c.platform, extId: c.extId, name: c.name, url: c.url, date: localDate(start), start: hhmm(start), durationMin: c.durationMin },
      });
      res.setData((l) => l.map((x) => (x.extId === c.extId ? { ...x, planned: true } : x)));
      toast('Added to your calendar');
      onChanged();
    } catch (e) {
      toast(e.message, 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>Upcoming on Codeforces</h3>
          <p className="sub">Plan a contest to put it on your calendar. Add AtCoder, CodeChef or others in Contests.</p>
        </div>
        <button className="icon-btn icon-btn-box" onClick={res.reload} aria-label="Refresh" title="Refresh"><Icon name="repeat" size={16} /></button>
      </div>
      {res.loading && !res.data && <Loading />}
      <ErrorNote error={res.error} onRetry={res.reload} />
      {res.data && !res.data.length && <p className="empty">No upcoming contests announced.</p>}
      <ul className="record-list">
        {(res.data || []).map((c) => {
          const start = new Date(c.start);
          return (
            <li key={c.extId} className="record">
              <div className="record-row">
                <span className="cp-date tnum">
                  {start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                  <span className="sub">{start.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                </span>
                <span className="record-main is-static">
                  <a className="strong record-title link-plain" href={c.url} target="_blank" rel="noreferrer">{c.name}</a>
                  <span className="sub">{minutes(c.durationMin)} · {countdown(c.start)}</span>
                </span>
                {c.planned
                  ? <Badge tone="ok">Planned</Badge>
                  : <button className="btn btn-ghost btn-sm" onClick={() => plan(c)} disabled={busy === c.extId}><Icon name="calendar" size={15} />Plan</button>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
