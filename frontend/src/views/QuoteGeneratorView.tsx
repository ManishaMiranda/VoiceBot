import React, { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import AudioPlayer from '../components/AudioPlayer';
import ColleagueCard from '../components/ColleagueCard';
import { api } from '../api/client';

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

  const handleGenerate = async () => {
    if (!selectedColleagueId) return;

    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await api.getRandomQuote(selectedColleagueId);
      setResult(res.data);
    } catch (err) {
      if (isAxiosError(err) && err.response?.data) {
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
    <div
      style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: '2rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
      }}
    >
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
          💬 Quote Generator
        </h1>
        <p style={{ fontSize: '1rem', color: '#64748b', margin: '0.25rem 0 0' }}>
          Pick a colleague and hear a random quote in their voice.
        </p>
      </div>

      {/* Colleague selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <span
          style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: '#374151',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Choose a colleague
        </span>
        {loadingColleagues ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="cvb-shimmer"
                aria-hidden="true"
                style={{ height: 110, borderRadius: 12 }}
              />
            ))}
          </div>
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

      {/* Generate button */}
      <button
        type="button"
        className="cvb-btn-amber"
        disabled={!selectedColleagueId || generating}
        onClick={handleGenerate}
        aria-busy={generating}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '0.85rem 2.5rem',
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: '1rem',
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'opacity 0.15s, transform 0.1s',
          alignSelf: 'flex-start',
        }}
      >
        {generating && (
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
        {generating ? 'Generating…' : '💬 Generate Quote'}
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
      {(generating || result) && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {result && (
            <blockquote
              style={{
                margin: 0,
                padding: '0 0 0 1rem',
                borderLeft: '4px solid #f59e0b',
                fontSize: '1.1rem',
                fontStyle: 'italic',
                color: '#1e293b',
                lineHeight: 1.6,
              }}
            >
              "{result.quoteText}"
            </blockquote>
          )}
          <AudioPlayer audioUrl={result?.audioUrl ?? null} loading={generating} label="Audio" />
        </div>
      )}
    </div>
  );
};

export default QuoteGeneratorView;
