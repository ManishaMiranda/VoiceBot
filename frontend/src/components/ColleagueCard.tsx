import React from 'react';
import styles from './ColleagueCard.module.css';

export interface ColleagueCardProps {
  colleagueId: string;
  displayName: string;
  status: 'ready' | 'processing' | 'pending' | 'failed';
  selected?: boolean;
  onClick?: () => void;
}

const STATUS_CONFIG = {
  ready: { label: 'Ready', className: styles.badgeReady },
  processing: { label: 'Building...', className: styles.badgeProcessing, spinner: true },
  pending: { label: 'Pending', className: styles.badgePending },
  failed: { label: 'Failed', className: styles.badgeFailed },
} as const;

const ColleagueCard: React.FC<ColleagueCardProps> = ({
  colleagueId,
  displayName,
  status,
  selected = false,
  onClick,
}) => {
  const config = STATUS_CONFIG[status];
  // Use first letter of display name as avatar initial
  const initial = displayName.charAt(0).toUpperCase();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${displayName}, status: ${status}${selected ? ', selected' : ''}`}
      data-colleague-id={colleagueId}
      className={`${styles.card}${selected ? ` ${styles.selected}` : ''}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.avatar} aria-hidden="true">
        {initial}
      </div>
      <span className={styles.name}>{displayName}</span>
      <span className={`${styles.badge} ${config.className}`}>
        {'spinner' in config && config.spinner && (
          <span className={styles.spinner} aria-hidden="true" />
        )}
        {config.label}
      </span>
    </div>
  );
};

export default ColleagueCard;
