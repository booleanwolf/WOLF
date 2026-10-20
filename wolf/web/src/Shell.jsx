import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTheme } from './theme.js';
import { Icon, WolfMark } from './ui.jsx';

// The Android app is Wolf in a web view; it adds "WolfApp" to its user agent, so it does not offer itself.
export const IN_APP = /WolfApp/.test(navigator.userAgent);
export const APK_URL = '/wolf.apk';

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'home', match: (p) => p === '/' || p.startsWith('/w/') || p.startsWith('/b/') },
  { to: '/routine', label: 'Routine', icon: 'repeat', match: (p) => p.startsWith('/routine') },
  { to: '/calendar', label: 'Calendar', icon: 'calendar', match: (p) => p.startsWith('/calendar') },
  { to: '/cp', label: 'CP', icon: 'code', match: (p) => p.startsWith('/cp') },
];

function NavLinks({ className }) {
  const { pathname } = useLocation();
  return (
    <nav className={className} aria-label="Main">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} className={() => `nav-link ${n.match(pathname) ? 'is-active' : ''}`}
          aria-current={n.match(pathname) ? 'page' : undefined}>
          <Icon name={n.icon} size={18} />
          <span>{n.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function Shell({ user, onSignOut }) {
  const [theme, toggle] = useTheme();
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    const on = () => setOutdated(true);
    window.addEventListener('wolf:update-available', on);
    return () => window.removeEventListener('wolf:update-available', on);
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="Wolf home">
            <WolfMark />
            <span className="brand-name">Wolf</span>
          </Link>
          <NavLinks className="nav nav-top" />
          <div className="topbar-actions">
            {!IN_APP && (
              <a href={APK_URL} download="Wolf.apk" className="btn btn-ghost btn-sm nav-app" title="Download the Android app">
                <Icon name="download" size={15} /><span>Download App</span>
              </a>
            )}
            <Link to="/w/new" className="btn btn-primary btn-sm nav-new"><Icon name="plus" size={15} />New</Link>
            <button className="icon-btn" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title="Toggle theme">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <span className="user-name">{user.username}</span>
            <button className="icon-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>
      {outdated && (
        <div className="update-bar" role="status">
          <span>Wolf has been updated. Reload to get the new version.</span>
          <button className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}
      <main className="main">
        <Outlet />
      </main>
      {/* On phones the main links move to a bar at the bottom of the screen. */}
      <NavLinks className="nav nav-bottom" />
    </div>
  );
}
