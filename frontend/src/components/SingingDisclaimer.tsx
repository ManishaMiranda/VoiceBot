import React, { useState } from 'react';
import styles from './SingingDisclaimer.module.css';

export interface SingingDisclaimerProps {
  /** If provided, controls visibility externally; otherwise component manages its own state */
  visible?: boolean;
  onDismiss?: () => void;
}

const SingingDisclaimer: React.FC<SingingDisclaimerProps> = ({ visible, onDismiss }) => {
  const [dismissed, setDismissed] = useState(false);

  const isVisible = visible !== undefined ? visible : !dismissed;

  if (!isVisible) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div className={styles.banner} role="note" aria-label="Singing mode disclaimer">
      <span className={styles.icon} aria-hidden="true">ℹ️</span>
      <p className={styles.text}>
        🎵 Singing mode is experimental. Voice profiles are built from spoken recordings, so quality
        may vary.
      </p>
      <button
        type="button"
        className={styles.dismissBtn}
        onClick={handleDismiss}
        aria-label="Dismiss singing disclaimer"
      >
        ×
      </button>
    </div>
  );
};

export default SingingDisclaimer;
