import { useState } from 'react';
import { Icon } from '../ui.jsx';
import { stepState } from './meta.js';
import { StepBar } from './EntityTile.jsx';

const key = (id) => `wolf-steps-open-${id}`;
function readOpen(id) {
  try { return localStorage.getItem(key(id)) === '1'; } catch { return false; }
}

/**
 * The step line at the top of an entry, collapsed to a one-line summary until opened.
 * Steps before stepIndex are done, the one at stepIndex is in progress. Picking a step makes it current.
 */
export default function Stepper({ entity, openByStep, onSetIndex, busy }) {
  const s = stepState(entity);
  const [open, setOpen] = useState(() => readOpen(entity.id));
  const toggle = () => {
    setOpen(!open);
    try { localStorage.setItem(key(entity.id), open ? '0' : '1'); } catch {}
  };

  return (
    <section className={`panel stepper-panel ${open ? 'is-open' : ''}`} style={{ '--biz': entity.color }}>
      <div className="stepper-head">
        <button type="button" className="stepper-toggle" onClick={toggle} aria-expanded={open} aria-controls={`steps-${entity.id}`}>
          <Icon name="chevron" size={16} />
          <span className="stepper-summary">
            <span className="strong">{s.finished ? 'All steps complete' : `Step ${s.done + 1} of ${s.total}: ${s.current.name}`}</span>
            {!open && <StepBar entity={entity} />}
          </span>
        </button>
        {open && (
          <div className="stepper-actions">
            {s.done > 0 && (
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onSetIndex(s.done - 1)}>
                <Icon name="back" size={15} />Back a step
              </button>
            )}
            {!s.finished && (
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onSetIndex(s.done + 1)}>
                <Icon name="check" size={15} />{s.done + 1 === s.total ? 'Finish last step' : `Complete ${s.current.name}`}
              </button>
            )}
          </div>
        )}
      </div>
      {open && (
        <ol className="stepper" id={`steps-${entity.id}`} style={{ '--n': s.total }}>
          {entity.steps.map((step, i) => {
            const state = i < s.done ? 'done' : i === s.done ? 'current' : 'todo';
            const count = openByStep[step.id] || 0;
            return (
              <li key={step.id} className={`step is-${state}`}>
                <button type="button" disabled={busy || state === 'current'} onClick={() => onSetIndex(i)}
                  aria-current={state === 'current' ? 'step' : undefined}
                  aria-label={`${step.name}, ${state === 'done' ? 'done' : state === 'current' ? 'in progress' : 'not started'}${count ? `, ${count} open tasks` : ''}. Make current.`}>
                  <span className="step-dot" aria-hidden="true">{state === 'done' ? <Icon name="check" size={14} /> : i + 1}</span>
                  <span className="step-name">{step.name}</span>
                  {count > 0 && <span className="step-count" aria-hidden="true">{count} open</span>}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
