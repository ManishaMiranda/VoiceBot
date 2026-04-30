import React, { useEffect, useRef, useState } from 'react';

export interface NicknameModalProps {
  isOpen: boolean;
  onConfirm: (nickname: string) => void;
  onCancel: () => void;
}

const NicknameModal: React.FC<NicknameModalProps> = ({ isOpen, onConfirm, onCancel }) => {
  const [nickname, setNickname] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus the input when the modal opens
  useEffect(() => {
    if (isOpen) {
      setNickname('');
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isOpen]);

  // Trap focus within the modal
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, input, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nickname.trim()) {
      onConfirm(nickname.trim());
    }
  };

  return (
    <div
      onClick={handleOverlayClick}
      aria-modal="true"
      role="dialog"
      aria-labelledby="nickname-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
    >
      <div
        ref={dialogRef}
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '2rem',
          width: '100%',
          maxWidth: 420,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
      >
        <h2
          id="nickname-modal-title"
          style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0 }}
        >
          🏆 Submit Your Score
        </h2>
        <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '-0.75rem 0 0' }}>
          Enter a nickname to appear on the leaderboard.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="cvb-input"
            placeholder="Your nickname…"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 30))}
            maxLength={30}
            aria-label="Nickname"
            autoComplete="off"
            style={{
              width: '100%',
              padding: '0.7rem 0.875rem',
              border: '1.5px solid #d1d5db',
              borderRadius: 8,
              fontSize: '1rem',
              fontFamily: 'inherit',
              color: '#1e293b',
              transition: 'border-color 0.15s',
              boxSizing: 'border-box',
            }}
          />

          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'flex-end',
              marginTop: '1.25rem',
            }}
          >
            <button
              type="button"
              className="cvb-cancel-btn"
              onClick={onCancel}
              style={{
                padding: '0.65rem 1.25rem',
                background: '#f1f5f9',
                color: '#475569',
                border: 'none',
                borderRadius: 8,
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cvb-confirm-btn"
              disabled={!nickname.trim()}
              style={{
                padding: '0.65rem 1.5rem',
                background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
            >
              Submit Score
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NicknameModal;
