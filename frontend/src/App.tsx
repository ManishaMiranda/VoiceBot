import React, { useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import SynthesisForm from './components/SynthesisForm';
import QuoteGeneratorView from './views/QuoteGeneratorView';
import VoiceQuizView from './views/VoiceQuizView';
import LeaderboardView from './views/LeaderboardView';
import styles from './App.module.css';

interface NavItem {
  to: string;
  emoji: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', emoji: '🎙️', label: 'Synthesize' },
  { to: '/quotes', emoji: '💬', label: 'Quotes' },
  { to: '/quiz', emoji: '🎯', label: 'Quiz' },
  { to: '/leaderboard', emoji: '🏆', label: 'Leaderboard' },
];

const SynthesisPage: React.FC = () => (
  <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1.5rem' }}>
    <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.25rem' }}>
      🎙️ Speech Synthesis
    </h1>
    <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
      Type any text and hear it in a colleague's voice.
    </p>
    <SynthesisForm />
  </div>
);

const App: React.FC = () => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <BrowserRouter>
      <div className={styles.app}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <NavLink to="/" className={() => styles.logo} onClick={closeMobileNav}>
              🎤 Colleague Voice Bot
            </NavLink>

            {/* Desktop nav */}
            <nav className={styles.nav} aria-label="Main navigation">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `${styles.navLink}${isActive ? ` ${styles.navLinkActive}` : ''}`
                  }
                >
                  <span aria-hidden="true">{item.emoji}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            {/* Hamburger (mobile) */}
            <button
              type="button"
              className={styles.hamburger}
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav"
              onClick={() => setMobileNavOpen((prev) => !prev)}
            >
              {mobileNavOpen ? '✕' : '☰'}
            </button>
          </div>

          {/* Mobile nav drawer */}
          <nav
            id="mobile-nav"
            className={`${styles.mobileNav}${mobileNavOpen ? ` ${styles.open}` : ''}`}
            aria-label="Mobile navigation"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `${styles.mobileNavLink}${isActive ? ` ${styles.mobileNavLinkActive}` : ''}`
                }
                onClick={closeMobileNav}
              >
                <span aria-hidden="true">{item.emoji}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        {/* ── Main content ────────────────────────────────────────────────── */}
        <main className={styles.main}>
          <Routes>
            <Route path="/" element={<SynthesisPage />} />
            <Route path="/quotes" element={<QuoteGeneratorView />} />
            <Route path="/quiz" element={<VoiceQuizView />} />
            <Route path="/leaderboard" element={<LeaderboardView />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};

export default App;
