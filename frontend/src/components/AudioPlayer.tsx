import React from 'react';
import styles from './AudioPlayer.module.css';

export interface AudioPlayerProps {
  audioUrl: string | null;
  loading?: boolean;
  label?: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioUrl, loading = false, label }) => {
  if (loading) {
    return (
      <div className={styles.container}>
        {label && <span className={styles.label}>{label}</span>}
        <div className={styles.loadingWrapper} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <span>Generating audio…</span>
        </div>
      </div>
    );
  }

  if (!audioUrl) {
    return null;
  }

  return (
    <div className={styles.container}>
      {label && <span className={styles.label}>{label}</span>}
      <audio
        className={styles.audio}
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
