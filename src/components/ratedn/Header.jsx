import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const go = (path) => { setMenuOpen(false); navigate(path); };

  const goHomeTarget = (target) => {
    if (window.location.pathname === '/') {
      setMenuOpen(false);
      document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (target === 'profile-text') window.setTimeout(() => document.getElementById(target)?.focus(), 450);
    } else {
      go(`/?focus=${encodeURIComponent(target)}`);
    }
  };

  return (
    <header>
      <button className="wordmark" onClick={() => go('/')} aria-label="Rated N home">Rated <i>N</i></button>
      <button className="menu-toggle" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X /> : <Menu />}</button>
      <nav className={menuOpen ? 'nav-open' : ''} aria-label="Primary navigation">
        <button onClick={() => go('/dashboard')}>Dashboard</button>
        <button onClick={() => goHomeTarget('how-it-works')}>How it works</button>
        {user && <button className="account-link" onClick={async () => { await logout(); go('/login'); }}>Sign out</button>}
        <button className="nav-cta" onClick={() => goHomeTarget('profile-text')}>Get started</button>
      </nav>
    </header>
  );
}
