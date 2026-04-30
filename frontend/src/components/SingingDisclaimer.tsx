import React, { useState } from 'react';

export interface SingingDisclaimerProps {
  /** If provided, controls visibility externally; otherwise component manages its own state */
  visible?: boolean;
  onDismiss?: () => void;
}

const SingingDisclaimer: React.FC<SingingDisclaimerProps> = ({ visible, onDismiss }) => {
  const [dismissed, setDismissed] = useState(false);

  const isVisible = visible !== undefined ? visible : !dismissed;

  if (!isVisible) return <div style={{ display: 'none' }} aria-hidden="true" />;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div
      role="note"
      aria-label="Singing mode disclaimer"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.875rem 1rem',
        background: '#fffbeb',
        border: '1px solid #fcd34d',
        borderRadius: 10,
        position: 'relative',
      }}
    >
      <span
        aria-hidden="true"
        style={{ fontSize: '1.2rem', flexShrink: 0, lineHeight: 1.4 }}
      >
        ℹ️
      </span>
      <p
        style={{
          fontSize: '0.875rem',
          color: '#92400e',
          lineHeight: 1.5,
          flex: 1,
          margin: 0,
        }}
      >
        🎵 Singing mode is experimental. Voice profiles are built from spoken recordings, so quality
        may vary.
      </p>
      <button
        type="button"
        className="cvb-dismiss-btn"
        onClick={handleDismiss}
        aria-label="Dismiss singing disclaimer"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#b45309',
          fontSize: '1.1rem',
          lineHeight: 1,
          padding: '0.1rem 0.25rem',
          borderRadius: 4,
          flexShrink: 0,
          transition: 'background 0.15s',
        }}
      >
        ×
      </button>
    </div>
  );
};

export default SingingDisclaimer;
