import React, { useEffect, useRef, useState } from 'react';
import styles from './NicknameModal.module.css';

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
      // Small delay to allow the animation to start before focusing
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
      className={styles.overlay}
      onClick={handleOverlayClick}
      aria-modal="true"
      role="dialog"
      aria-labelledby="nickname-modal-title"
    >
      <div className={styles.dialog} ref={dialogRef}>
        <h2 id="nickname-modal-title" className={styles.title}>
          🏆 Submit Your Score
        </h2>
        <p className={styles.subtitle}>Enter a nickname to appear on the leaderboard.</p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder="Your nickname…"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 30))}
            maxLength={30}
            aria-label="Nickname"
            autoComplete="off"
          />

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onCancel}>
              Cancel
            </button>
            <button
              type="submit"
              className={styles.confirmBtn}
              disabled={!nickname.trim()}
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
