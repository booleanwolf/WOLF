import { w } from '../api.js';
import { useAsync } from '../useAsync.js';
import { toast } from '../ui.jsx';

/** List + add/update/remove for one kind of per-entry record (papers, slots, cts). */
export function useRecords(entityId, path, sort) {
  const res = useAsync(() => w(`entities/${entityId}/${path}`), [entityId, path]);
  const put = (fn) => res.setData((list) => (sort ? [...fn(list || [])].sort(sort) : fn(list || [])));
  return {
    ...res,
    list: res.data || [],
    add: async (body) => {
      const r = await w(`entities/${entityId}/${path}`, { method: 'POST', body });
      put((l) => [...l, r]);
      return r;
    },
    update: async (id, body) => {
      const r = await w(`${path}/${id}`, { method: 'PATCH', body });
      put((l) => l.map((x) => (x.id === id ? r : x)));
      return r;
    },
    /** Asks first; resolves true once deleted. */
    remove: async (id, label) => {
      if (!window.confirm(`Delete ${label}?`)) return false;
      try {
        await w(`${path}/${id}`, { method: 'DELETE' });
        put((l) => l.filter((x) => x.id !== id));
        return true;
      } catch (e) {
        toast(e.message, 'danger');
        return false;
      }
    },
  };
}
