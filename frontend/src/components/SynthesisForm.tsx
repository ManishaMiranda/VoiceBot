import React, { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import AudioPlayer from './AudioPlayer';
import ColleagueCard from './ColleagueCard';
import SingingDisclaimer from './SingingDisclaimer';
import { api } from '../api/client';

interface Colleague {
  colleagueId: string;
  displayName: string;
  status: 'ready' | 'processing' | 'pending' | 'failed';
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'hi', label: 'Hindi' },
] as const;

const SynthesisForm: React.FC = () => {
  const [text, setText] = useState('');
  const [selectedColleagueId, setSelectedColleagueId] = useState<string | null>(null);
  const [language, setLanguage] = useState<'en' | 'fr' | 'hi'>('en');
  const [singing, setSinging] = useState(false);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [loadingColleagues, setLoadingColleagues] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxChars = singing ? 200 : 500;
  const charCount = text.length;
  const isOverLimit = charCount > maxChars;
  const isNearLimit = charCount > maxChars * 0.85;

  useEffect(() => {
    const fetchColleagues = async () => {
      try {
        const res = await api.getColleagues();
        setColleagues(Array.isArray(res.data) ? res.data : []);
      } catch {
        setColleagues([]);
      } finally {
        setLoadingColleagues(false);
      }
    };
    void fetchColleagues();
  }, []);

  // When singing mode is toggled on, trim text if it exceeds 200 chars
  useEffect(() => {
    if (singing && text.length > 200) {
      setText((prev) => prev.slice(0, 200));
    }
  }, [singing, text.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedColleagueId || isOverLimit || !text.trim()) return;

    setSubmitting(true);
    setError(null);
    setAudioUrl(null);
    setShowDisclaimer(false);

    try {
      const res = await api.synthesize({ text: text.trim(), colleagueId: selectedColleagueId, language, singing });
      setAudioUrl(res.data.audioUrl);
      if (singing) setShowDisclaimer(true);
    } catch (err) {
      if (isAxiosError(err) && err.response?.data) {
        const data = err.response.data as { message?: string; error?: string };
        setError(data.message ?? data.error ?? 'Synthesis failed. Please try again.');
      } else {
        setError('Synthesis failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const charCounterStyle: React.CSSProperties = {
    fontSize: '0.78rem',
    textAlign: 'right',
    color: isOverLimit ? '#dc2626' : isNearLimit ? '#d97706' : '#94a3b8',
    fontWeight: isOverLimit || isNearLimit ? 600 : 400,
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
    >
      {/* Text input */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <label
          htmlFor="synthesis-text"
          style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}
        >
          Text to synthesize
        </label>
        <textarea
          id="synthesis-text"
          className="cvb-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type something for your colleague to say…"
          maxLength={singing ? 200 : undefined}
          aria-describedby="char-counter"
          style={{
            width: '100%',
            minHeight: 120,
            padding: '0.75rem',
            border: '1.5px solid #d1d5db',
            borderRadius: 8,
            fontSize: '0.95rem',
            fontFamily: 'inherit',
            resize: 'vertical',
            transition: 'border-color 0.15s',
            boxSizing: 'border-box',
            color: '#1e293b',
            background: '#fff',
          }}
        />
        <span id="char-counter" style={charCounterStyle} aria-live="polite">
          {charCount} / {maxChars}
        </span>
      </div>

      {/* Colleague selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>
          Choose a colleague
        </span>
        {loadingColleagues ? (
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Loading colleagues…</p>
        ) : (
          <div
            role="group"
            aria-label="Colleague selection"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {colleagues.map((c) => (
              <ColleagueCard
                key={c.colleagueId}
                colleagueId={c.colleagueId}
                displayName={c.displayName}
                status={c.status}
                selected={selectedColleagueId === c.colleagueId}
                onClick={() =>
                  setSelectedColleagueId((prev) =>
                    prev === c.colleagueId ? null : c.colleagueId,
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Language selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <label
          htmlFor="language-select"
          style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}
        >
          Language
        </label>
        <select
          id="language-select"
          className="cvb-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value as 'en' | 'fr' | 'hi')}
          style={{
            padding: '0.6rem 0.75rem',
            border: '1.5px solid #d1d5db',
            borderRadius: 8,
            fontSize: '0.95rem',
            fontFamily: 'inherit',
            background: '#fff',
            color: '#1e293b',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
            maxWidth: 240,
          }}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {/* Singing mode toggle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <label
          htmlFor="singing-toggle"
          style={{
            fontSize: '0.9rem',
            color: '#374151',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <input
            id="singing-toggle"
            type="checkbox"
            role="switch"
            className="cvb-toggle"
            checked={singing}
            onChange={(e) => setSinging(e.target.checked)}
            aria-label="Singing mode"
          />
          🎵 Singing mode
          {singing && (
            <span style={{ fontSize: '0.78rem', color: '#a16207', marginLeft: '0.25rem' }}>
              (max 200 chars)
            </span>
          )}
        </label>
      </div>

      {/* Submit */}
      <button
        type="submit"
        className="cvb-btn-primary"
        disabled={submitting || !selectedColleagueId || !text.trim() || isOverLimit}
        aria-busy={submitting}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '0.75rem 2rem',
          background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: '1rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'opacity 0.15s, transform 0.1s',
          alignSelf: 'flex-start',
        }}
      >
        {submitting && (
          <span
            className="cvb-spin"
            aria-hidden="true"
            style={{
              width: 16,
              height: 16,
              border: '2px solid rgba(255,255,255,0.4)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              display: 'inline-block',
            }}
          />
        )}
        {submitting ? 'Synthesizing…' : '🎙️ Synthesize'}
      </button>

      {/* Error */}
      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            color: '#b91c1c',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Result */}
      {(submitting || audioUrl) && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            padding: '1.25rem',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
          }}
        >
          <AudioPlayer audioUrl={audioUrl} loading={submitting} label="Result" />
          {showDisclaimer && !submitting && (
            <SingingDisclaimer onDismiss={() => setShowDisclaimer(false)} />
          )}
        </div>
      )}
    </form>
  );
};

export default SynthesisForm;
