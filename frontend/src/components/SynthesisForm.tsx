import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AudioPlayer from './AudioPlayer';
import ColleagueCard from './ColleagueCard';
import SingingDisclaimer from './SingingDisclaimer';
import { api } from '../api/client';
import styles from './SynthesisForm.module.css';

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
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data as { message?: string; error?: string };
        setError(data.message ?? data.error ?? 'Synthesis failed. Please try again.');
      } else {
        setError('Synthesis failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const charCounterClass =
    isOverLimit
      ? styles.charCounterOver
      : isNearLimit
        ? styles.charCounterWarn
        : styles.charCounter;

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {/* Text input */}
      <div className={styles.fieldGroup}>
        <label htmlFor="synthesis-text" className={styles.label}>
          Text to synthesize
        </label>
        <textarea
          id="synthesis-text"
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type something for your colleague to say…"
          maxLength={singing ? 200 : undefined}
          aria-describedby="char-counter"
        />
        <span id="char-counter" className={charCounterClass} aria-live="polite">
          {charCount} / {maxChars}
        </span>
      </div>

      {/* Colleague selector */}
      <div className={styles.fieldGroup}>
        <span className={styles.label}>Choose a colleague</span>
        {loadingColleagues ? (
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Loading colleagues…</p>
        ) : (
          <div className={styles.colleagueGrid} role="group" aria-label="Colleague selection">
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
      <div className={styles.fieldGroup}>
        <label htmlFor="language-select" className={styles.label}>
          Language
        </label>
        <select
          id="language-select"
          className={styles.select}
          value={language}
          onChange={(e) => setLanguage(e.target.value as 'en' | 'fr' | 'hi')}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {/* Singing mode toggle */}
      <div className={styles.fieldGroup}>
        <label className={styles.toggleLabel} htmlFor="singing-toggle">
          <input
            id="singing-toggle"
            type="checkbox"
            role="switch"
            className={styles.toggle}
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
        className={styles.submitBtn}
        disabled={submitting || !selectedColleagueId || !text.trim() || isOverLimit}
        aria-busy={submitting}
      >
        {submitting && <span className={styles.spinner} aria-hidden="true" />}
        {submitting ? 'Synthesizing…' : '🎙️ Synthesize'}
      </button>

      {/* Error */}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      {/* Result */}
      {(submitting || audioUrl) && (
        <div className={styles.resultSection}>
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
