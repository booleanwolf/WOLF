import { useEffect, useState } from 'react';

function read() {
  try {
    const t = localStorage.getItem('wolf-theme');
    if (t === 'dark' || t === 'light') return t;
  } catch {}
  return 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('wolf-theme', theme); } catch {}
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}
