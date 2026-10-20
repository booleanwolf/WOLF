import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { w } from '../api.js';
import { useAsync } from '../useAsync.js';
import { ErrorNote, Field, Icon, Loading, Switch, toast } from '../ui.jsx';
import { CATEGORIES, CATEGORY_ORDER, STATUS, SWATCHES } from './meta.js';
import { resizeImage } from './thumb.js';

let tempId = 0;
const stepRows = (names) => names.map((name) => ({ key: `n${++tempId}`, name }));

function blank(category) {
  const cat = CATEGORIES[category] || CATEGORIES.project;
  return {
    category,
    title: '',
    description: '',
    color: cat.color,
    status: 'active',
    dueDate: '',
    useSteps: cat.stepsByDefault,
    steps: cat.stepsByDefault ? stepRows(cat.steps) : [],
    stepIndex: 0,
  };
}

const fromEntity = (e) => ({
  category: e.category,
  title: e.title,
  description: e.description,
  color: e.color,
  status: e.status,
  dueDate: e.dueDate || '',
  useSteps: e.steps.length > 0,
  steps: e.steps.map((s) => ({ key: s.id, id: s.id, name: s.name })),
  stepIndex: e.stepIndex,
});

function StepsEditor({ form, setForm }) {
  const cat = CATEGORIES[form.category];
  const steps = form.steps;
  const setSteps = (next) => setForm((f) => ({ ...f, steps: next }));
  const update = (i, name) => setSteps(steps.map((s, j) => (j === i ? { ...s, name } : s)));
  const move = (i, d) => {
    const next = [...steps];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setSteps(next);
  };
  const remove = (i) => setSteps(steps.filter((_, j) => j !== i));
  const add = () => setSteps([...steps, ...stepRows([''])]);

  return (
    <div className="stack">
      {steps.length > 0 && (
        <ol className="step-edit-list">
          {steps.map((s, i) => (
            <li key={s.key} className="step-edit-row">
              <span className="step-edit-num" aria-hidden="true">{i + 1}</span>
              <input className="input" value={s.name} maxLength={80} placeholder="Step name" aria-label={`Step ${i + 1} name`}
                onChange={(e) => update(i, e.target.value)} required />
              <div className="req-actions">
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move step up"><Icon name="up" size={16} /></button>
                <button type="button" className="icon-btn" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Move step down"><Icon name="down" size={16} /></button>
                <button type="button" className="icon-btn danger" onClick={() => remove(i)} aria-label={`Remove step ${i + 1}`}><Icon name="trash" size={16} /></button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="step-edit-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={add} disabled={steps.length >= 20}><Icon name="plus" size={15} />Add step</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSteps(stepRows(cat.steps))}>
          Use suggested {cat.label.toLowerCase()} steps
        </button>
      </div>
    </div>
  );
}

function ThumbPicker({ preview, onPick, onClear, color, category }) {
  const input = useRef(null);
  return (
    <div className="thumb-pick">
      <div className="biz-thumb thumb-preview" style={{ '--biz': color }}>
        {preview
          ? <img src={preview} alt="Thumbnail preview" />
          : <span className="ent-thumb-icon" aria-hidden="true"><Icon name={CATEGORIES[category].icon} size={44} /></span>}
      </div>
      <div className="thumb-actions">
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files[0]) onPick(e.target.files[0]); e.target.value = ''; }} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current.click()}>
          <Icon name="image" size={15} />{preview ? 'Change image' : 'Choose image'}
        </button>
        {preview && <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>Remove</button>}
        <span className="field-hint">Shown on the dashboard tile. Without one, the colour and category icon are used.</span>
      </div>
    </div>
  );
}

export default function EntityForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const existing = useAsync(() => (editing ? w(`entities/${id}`) : Promise.resolve(null)), [id]);

  const [form, setForm] = useState(() => (editing ? null : blank(CATEGORIES[params.get('category')] ? params.get('category') : 'research')));
  // thumb: undefined = unchanged, null = remove, Blob = new image.
  const [thumb, setThumb] = useState(undefined);
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existing.data) {
      setForm(fromEntity(existing.data));
      setPreview(existing.data.thumbUrl);
    }
  }, [existing.data]);

  useEffect(() => () => { if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview); }, [preview]);

  if (editing && existing.loading && !form) return <Loading />;
  if (editing && existing.error) return <ErrorNote error={existing.error} onRetry={existing.reload} />;
  if (!form) return null;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const pickCategory = (category) => {
    if (category === form.category) return;
    const cat = CATEGORIES[category];
    setForm((f) => {
      // Swap untouched defaults for the new category's; keep anything the user changed.
      const oldCat = CATEGORIES[f.category];
      const untouchedSteps = f.steps.map((s) => s.name).join('|') === oldCat.steps.join('|') || !f.steps.length;
      const next = { ...f, category, color: f.color === oldCat.color ? cat.color : f.color };
      if (!editing && untouchedSteps) {
        next.useSteps = cat.stepsByDefault;
        next.steps = cat.stepsByDefault ? stepRows(cat.steps) : [];
      }
      return next;
    });
  };

  const toggleSteps = (on) => setForm((f) => ({
    ...f,
    useSteps: on,
    steps: on && !f.steps.length ? stepRows(CATEGORIES[f.category].steps) : f.steps,
  }));

  const pickImage = async (file) => {
    setErr(null);
    try {
      const blob = await resizeImage(file);
      setThumb(blob);
      setPreview(URL.createObjectURL(blob));
    } catch (e) {
      setErr(e);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const steps = form.useSteps ? form.steps.map((s) => ({ ...(s.id && { id: s.id }), name: s.name.trim() })) : [];
    const body = {
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim(),
      color: form.color,
      status: form.status,
      dueDate: form.dueDate || null,
      steps,
      stepIndex: Math.min(form.stepIndex, steps.length),
    };
    try {
      const saved = editing
        ? await w(`entities/${id}`, { method: 'PATCH', body })
        : await w('entities', { method: 'POST', body });
      try {
        if (thumb) await w(`entities/${saved.id}/thumb`, { method: 'PUT', blob: thumb });
        else if (thumb === null && editing) await w(`entities/${saved.id}/thumb`, { method: 'DELETE' });
      } catch (e2) {
        toast(`Saved, but the image did not upload: ${e2.message}`, 'danger');
        return navigate(`/w/${saved.id}`);
      }
      toast(editing ? 'Changes saved' : `${CATEGORIES[form.category].label} created`);
      navigate(`/w/${saved.id}`);
    } catch (e2) {
      setErr(e2);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${existing.data.title}" and all its tasks? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await w(`entities/${id}`, { method: 'DELETE' });
      toast('Deleted');
      navigate('/');
    } catch (e2) {
      setErr(e2);
      setBusy(false);
    }
  };

  const cat = CATEGORIES[form.category];

  return (
    <form className="stack product-form" onSubmit={save}>
      <Link to={editing ? `/w/${id}` : '/'} className="back"><Icon name="back" size={16} />{editing ? 'Back' : 'Dashboard'}</Link>
      <h1>{editing ? `Edit ${cat.label.toLowerCase()}` : 'New entry'}</h1>

      <section className="panel">
        <h3>What is it?</h3>
        <div className="cat-pick" role="radiogroup" aria-label="Category">
          {CATEGORY_ORDER.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={form.category === c}
              className={`type-opt ${form.category === c ? 'is-on' : ''}`} onClick={() => pickCategory(c)}>
              <span className="cat-pick-title"><Icon name={CATEGORIES[c].icon} size={18} />{CATEGORIES[c].label}</span>
              <span className="sub">{CATEGORIES[c].blurb}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Details</h3>
        <Field label="Title">
          <input className="input" value={form.title} onChange={set('title')} maxLength={120} required autoFocus={!editing}
            placeholder={{ research: 'Crack growth in 3D-printed PLA', project: 'Portfolio website', academic: 'ME 361: Heat Transfer' }[form.category]} />
        </Field>
        <Field label="Description" hint="Optional. Goals, links, anything you want to see at a glance.">
          <textarea className="input" rows={3} value={form.description} onChange={set('description')} maxLength={4000} />
        </Field>
        <div className="grid-2">
          <Field label="Due date" hint="Optional deadline for the whole thing.">
            <input className="input" type="date" value={form.dueDate} onChange={set('dueDate')} />
          </Field>
          {editing && (
            <Field label="Status">
              <select className="input select" value={form.status} onChange={set('status')}>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
          )}
        </div>
      </section>

      <section className="panel">
        <h3>Thumbnail</h3>
        <div className="field">
          <span className="field-label">Colour</span>
          <div className="swatches" role="radiogroup" aria-label="Colour">
            {SWATCHES.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={form.color === c} aria-label={c}
                className={`swatch ${form.color === c ? 'is-on' : ''}`} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} />
            ))}
          </div>
        </div>
        <ThumbPicker preview={preview} color={form.color} category={form.category} onPick={pickImage}
          onClear={() => { setThumb(null); setPreview(null); }} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Step line</h3>
            <p className="sub">
              {form.category === 'research'
                ? 'The stages this research moves through, shown across the top of its page.'
                : 'Optional stages shown across the top, e.g. planning, build, launch.'}
            </p>
          </div>
          <Switch checked={form.useSteps} onChange={toggleSteps} label="Use a step line" />
        </div>
        {form.useSteps && <StepsEditor form={form} setForm={setForm} />}
      </section>

      <ErrorNote error={err} />
      <div className="savebar">
        {editing && <button type="button" className="btn btn-danger-ghost" onClick={remove} disabled={busy}><Icon name="trash" size={16} />Delete</button>}
        <span className="push" />
        <Link to={editing ? `/w/${id}` : '/'} className="btn btn-ghost">Cancel</Link>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : `Create ${cat.label.toLowerCase()}`}</button>
      </div>
    </form>
  );
}
