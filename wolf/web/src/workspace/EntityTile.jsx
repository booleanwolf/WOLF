import { Link } from 'react-router-dom';
import { Icon } from '../ui.jsx';
import { CATEGORIES, STATUS, stepState } from './meta.js';

export function StepBar({ entity }) {
  const s = stepState(entity);
  if (!s.total) return null;
  return (
    <div className="stepbar" role="img" aria-label={`${s.done} of ${s.total} steps complete`}>
      {entity.steps.map((step, i) => (
        <span key={step.id} className={i < s.done ? 'is-done' : i === s.done ? 'is-current' : ''} />
      ))}
    </div>
  );
}

/** A compact folder-like tile. The corner badge says whether it is research, a project or academic. */
export default function EntityTile({ e }) {
  const cat = CATEGORIES[e.category];
  const open = e.tasks.total - e.tasks.done;
  return (
    <Link to={`/w/${e.id}`} className={`biz-tile ent-tile is-${e.status}`} style={{ '--biz': e.color }}
      title={e.tasks.next ? `${e.title}\nNext: ${e.tasks.next}` : e.title}>
      <div className="biz-thumb">
        {e.thumbUrl
          ? <img src={e.thumbUrl} alt="" loading="lazy" />
          : <span className="ent-thumb-icon" aria-hidden="true"><Icon name={cat.icon} size={28} /></span>}
        <span className="ent-corner" title={cat.label}><Icon name={cat.icon} size={13} /><span className="sr-only">{cat.label}</span></span>
      </div>
      <div className="ent-tile-body">
        <h2 className="ent-title">{e.title}</h2>
        <StepBar entity={e} />
        <p className="ent-meta">
          {e.status !== 'active' ? <span>{STATUS[e.status].label}</span> : <span>{open} open</span>}
          {e.tasks.overdue > 0 && <span className="is-alert">{e.tasks.overdue} late</span>}
        </p>
      </div>
    </Link>
  );
}
