import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AudioPlayer from '../components/AudioPlayer';
import ColleagueCard from '../components/ColleagueCard';
import styles from './QuoteGeneratorView.module.css';

interface Colleague {
  colleagueId: string;
  displayName: string;
  status: 'ready' | 'processing' | 'pending' | 'failed';
}

interface QuoteResult {
  quoteText: string;
  audioUrl: string;
}

const QuoteGeneratorView: React.FC = () => {
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [loadingColleagues, setLoadingColleagues] = useState(true);
  const [selectedColleagueId, setSelectedColleagueId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchColleagues = async () => {
      try {
        const res = await axios.get<Colleague[]>('/api/colleagues');
        setColleagues(Array.isArray(res.data) ? res.data : []);
      } catch {
        // Non-fatal
        setColleagues([]);
      } finally {
        setLoadingColleagues(false);
      }
    };
    void fetchColleagues();
  }, []);

  const handleGenerate = async () => {
    if (!selectedColleagueId) return;

    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await axios.post<QuoteResult>('/api/quotes/random', {
        colleagueId: selectedColleagueId,
      });
      setResult(res.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data as { message?: string; error?: string };
        setError(data.message ?? data.error ?? 'Failed to generate quote. Please try again.');
      } else {
        setError('Failed to generate quote. Please try again.');
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.heading}>💬 Quote Generator</h1>
        <p className={styles.subheading}>
          Pick a colleague and hear a random quote in their voice.
        </p>
      </div>

      {/* Colleague selector */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>Choose a colleague</span>
        {loadingColleagues ? (
          <div className={styles.loadingGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={styles.skeletonCard} aria-hidden="true" />
            ))}
          </div>
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

      {/* Generate button */}
      <button
        type="button"
        className={styles.generateBtn}
        disabled={!selectedColleagueId || generating}
        onClick={handleGenerate}
        aria-busy={generating}
      >
        {generating && <span className={styles.spinner} aria-hidden="true" />}
        {generating ? 'Generating…' : '💬 Generate Quote'}
      </button>

      {/* Error */}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      {/* Result */}
      {(generating || result) && (
        <div className={styles.quoteCard}>
          {result && (
            <blockquote className={styles.blockquote}>"{result.quoteText}"</blockquote>
          )}
          <AudioPlayer audioUrl={result?.audioUrl ?? null} loading={generating} label="Audio" />
        </div>
      )}
    </div>
  );
};

export default QuoteGeneratorView;
