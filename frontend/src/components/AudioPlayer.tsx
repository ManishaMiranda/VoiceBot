import React from 'react';

export interface AudioPlayerProps {
  audioUrl: string | null;
  loading?: boolean;
  label?: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, loading = false, label }) => {
  // Always render a container div — never return null.
  // Switching between null and a DOM element causes React reconciler crashes
  // when the component is conditionally shown/hidden.

  const labelEl = label ? (
    <span
      style={{
        fontSize: '0.85rem',
        fontWeight: 600,
        color: '#475569',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
      }}
    >
      {label}
    </span>
  ) : null;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {labelEl}
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem 1rem',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            color: '#64748b',
            fontSize: '0.875rem',
          }}
        >
          <span
            className="cvb-spin"
            aria-hidden="true"
            style={{
              width: 18,
              height: 18,
              border: '2px solid #cbd5e1',
              borderTopColor: '#7c3aed',
              borderRadius: '50%',
              flexShrink: 0,
              display: 'inline-block',
            }}
          />
          <span>Generating audio…</span>
        </div>
      </div>
    );
  }

  if (!audioUrl) {
    // Return empty div instead of null to keep the fiber stable
    return <div style={{ display: 'none' }} aria-hidden="true" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {labelEl}
      <audio
        style={{ width: '100%', borderRadius: 8, accentColor: '#7c3aed' }}
        controls
        src={audioUrl}
        aria-label={label ?? 'Synthesized audio player'}
      >
        Your browser does not support the audio element.
      </audio>
    </div>
  );
};

export default AudioPlayer;
