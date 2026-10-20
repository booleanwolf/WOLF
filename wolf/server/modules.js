// Registry of businesses Wolf manages. Add a new entry here (and a UI module) to bring another business in.
const env = process.env;

export const modules = [
  {
    id: 'clutchx3d',
    name: 'ClutchX3D',
    description: '3D printed props, figures and custom statues',
    color: '#2F4BFF',
    apiUrl: (env.CLUTCHX3D_API_URL || 'http://localhost:8080').replace(/\/$/, ''),
    adminKey: env.CLUTCHX3D_ADMIN_KEY || '',
    publicUrl: (env.CLUTCHX3D_PUBLIC_URL || env.CLUTCHX3D_API_URL || 'http://localhost:8080').replace(/\/$/, ''),
    // Only these upstream paths may be reached through the proxy.
    allowedPaths: [/^\/api\/admin\//, /^\/media\/products\//],
  },
];

export const findModule = (id) => modules.find((m) => m.id === id);

export async function moduleStatus(m) {
  try {
    const res = await fetch(`${m.apiUrl}/healthz`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

export const publicModule = (m, connected) => ({
  id: m.id,
  name: m.name,
  description: m.description,
  color: m.color,
  publicUrl: m.publicUrl,
  connected,
});
