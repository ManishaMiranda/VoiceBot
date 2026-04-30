import React from 'react';

export interface ColleagueCardProps {
  colleagueId: string;
  displayName: string;
  status: 'ready' | 'processing' | 'pending' | 'failed';
  selected?: boolean;
  onClick?: () => void;
}

const STATUS_CONFIG = {
  ready: {
    label: 'Ready',
    style: { background: '#dcfce7', color: '#15803d' },
  },
  processing: {
    label: 'Building...',
    style: { background: '#fef9c3', color: '#a16207' },
    spinner: true,
  },
  pending: {
    label: 'Pending',
    style: { background: '#f1f5f9', color: '#64748b' },
  },
  failed: {
    label: 'Failed',
    style: { background: '#fee2e2', color: '#b91c1c' },
  },
} as const;

const ColleagueCard: React.FC<ColleagueCardProps> = ({
  colleagueId,
  displayName,
  status,
  selected = false,
  onClick,
}) => {
  const config = STATUS_CONFIG[status];
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
      className="cvb-card"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      style={{
        position: 'relative',
        background: selected ? '#faf5ff' : '#fff',
        border: selected ? '2px solid #7c3aed' : '2px solid #e2e8f0',
        boxShadow: selected ? '0 4px 16px rgba(124,58,237,0.25)' : undefined,
        borderRadius: 12,
        padding: '1.25rem 1rem',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
        minWidth: 120,
        userSelect: 'none',
        outline: 'none',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.4rem',
          color: '#fff',
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {initial}
      </div>
      <span
        style={{
          fontSize: '0.95rem',
          fontWeight: 600,
          color: '#1e293b',
          textAlign: 'center',
          lineHeight: 1.3,
        }}
      >
        {displayName}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.2rem 0.6rem',
          borderRadius: 999,
          fontSize: '0.72rem',
          fontWeight: 600,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          ...config.style,
        }}
      >
        {'spinner' in config && config.spinner && (
          <span
            className="cvb-spin"
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              border: '2px solid currentColor',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              flexShrink: 0,
              display: 'inline-block',
            }}
          />
        )}
        {config.label}
      </span>
    </div>
  );
};

export default ColleagueCard;
