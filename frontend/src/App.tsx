import React, { useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import SynthesisForm from './components/SynthesisForm';
import QuoteGeneratorView from './views/QuoteGeneratorView';
import VoiceQuizView from './views/VoiceQuizView';
import LeaderboardView from './views/LeaderboardView';

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
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header
          style={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
            color: '#fff',
            boxShadow: '0 2px 12px rgba(109,40,217,0.3)',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <div
            style={{
              maxWidth: 1100,
              margin: '0 auto',
              padding: '0 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 60,
            }}
          >
            <NavLink
              to="/"
              className="cvb-logo"
              onClick={closeMobileNav}
              style={{
                fontSize: '1.2rem',
                fontWeight: 800,
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
                textDecoration: 'none',
                color: '#fff',
              }}
            >
              🎤 Colleague Voice Bot
            </NavLink>

            {/* Desktop nav */}
            <nav
              className="cvb-desktop-nav"
              aria-label="Main navigation"
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `cvb-nav-link${isActive ? ' cvb-nav-link-active' : ''}`
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 0.9rem',
                    borderRadius: 8,
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <span aria-hidden="true">{item.emoji}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            {/* Hamburger (mobile) */}
            <button
              type="button"
              className="cvb-hamburger"
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              style={{
                display: 'none',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0.4rem',
                color: '#fff',
                fontSize: '1.5rem',
                lineHeight: 1,
              }}
            >
              {mobileNavOpen ? '✕' : '☰'}
            </button>
          </div>

          {/* Mobile nav drawer */}
          <nav
            id="mobile-nav"
            aria-label="Mobile navigation"
            style={{
              display: mobileNavOpen ? 'flex' : 'none',
              flexDirection: 'column',
              background: '#6d28d9',
              padding: '0.5rem 1rem 1rem',
            }}
          >
            {NAV_ITEMS.map((item, idx) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `cvb-mobile-nav-link${isActive ? ' cvb-mobile-nav-link-active' : ''}`
                }
                onClick={closeMobileNav}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 0.5rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  borderBottom: idx < NAV_ITEMS.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                  transition: 'color 0.15s',
                }}
              >
                <span aria-hidden="true">{item.emoji}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        {/* ── Main content ────────────────────────────────────────────────── */}
        <main style={{ flex: 1 }}>
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
