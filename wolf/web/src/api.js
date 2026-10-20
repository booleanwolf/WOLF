export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const FIELD_NAMES = {
  bkashNumber: 'bKash number', nagadNumber: 'Nagad number', deliveryInsideDhaka: 'Delivery inside Dhaka',
  deliveryOutsideDhaka: 'Delivery outside Dhaka', storeNotice: 'Store notice', name: 'Name', slug: 'URL slug',
  price: 'Price', title: 'Title', color: 'Colour', steps: 'Steps', dueDate: 'Due date', notes: 'Notes', tagline: 'Tagline', description: 'Description', leadTime: 'Delivery time', images: 'Photos',
};

/** Turns validation paths like "requirements.1.options" into "Field 2, options". */
function prettify(msg) {
  const m = /^([\w.]+): (.*)$/.exec(msg || '');
  if (!m) return msg;
  const parts = m[1].split('.');
  if (parts[0] === 'requirements' && parts[1] !== undefined) {
    return `Field ${Number(parts[1]) + 1}${parts[2] ? `, ${parts.slice(2).join(' ')}` : ''}: ${m[2]}`;
  }
  if (parts[0] === 'specs' && parts[1] !== undefined) return `Spec ${Number(parts[1]) + 1}: ${m[2]}`;
  if (parts[0] === 'steps' && parts[1] !== undefined) return `Step ${Number(parts[1]) + 1}: ${m[2]}`;
  return `${FIELD_NAMES[parts[0]] || parts.join(' ')}: ${m[2]}`;
}

// This page's own build: the hashed entry script it was loaded from (only in a production build).
const OWN_BUILD = import.meta.env.PROD ? new URL(import.meta.url).pathname.split('/').pop() : '';
let announced = false;

/** Tells the app (once) when the server ships a newer build than the one running in this tab. */
function checkBuild(res) {
  const latest = res.headers.get('x-wolf-client');
  if (!OWN_BUILD || !latest || latest === OWN_BUILD || announced) return;
  announced = true;
  window.dispatchEvent(new Event('wolf:update-available'));
}

export async function api(path, { method = 'GET', body, form, blob, headers } = {}) {
  const init = { method, credentials: 'same-origin', headers: { ...headers } };
  if (form) init.body = form;
  else if (blob) {
    init.headers['Content-Type'] = blob.type || 'application/octet-stream';
    init.body = blob;
  }
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection.');
  }
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    window.dispatchEvent(new Event('wolf:signed-out'));
  }
  checkBuild(res);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, prettify(data?.error) || `Request failed (${res.status})`, data?.details);
  return data;
}

/** Wolf's own workspace API (projects, research, academics). */
export const w = (path, opts) => api(`/api/w/${path}`, opts);

/** Helpers for the ClutchX3D admin API behind the Wolf proxy. */
export const CX = '/api/m/clutchx3d';
export const cx = (path, opts) => api(`${CX}/api/admin/${path}`, opts);
export const cxMedia = (url) => (url ? `${CX}${url}` : '');
export const cxFile = (id, download) => `${CX}/api/admin/files/${id}${download ? '?download' : ''}`;
