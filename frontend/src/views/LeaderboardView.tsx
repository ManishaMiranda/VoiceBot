import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import NicknameModal from '../components/NicknameModal';
import styles from './LeaderboardView.module.css';

interface LeaderboardEntry {
  nickname: string;
  score: number;
  gamesPlayed?: number;
}

const RANK_CLASSES: Record<number, string> = {
  1: styles.rank1,
  2: styles.rank2,
  3: styles.rank3,
};

const LeaderboardView: React.FC = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Score submission inputs
  const [scoreInput, setScoreInput] = useState<number>(0);
  const [gamesPlayedInput, setGamesPlayedInput] = useState<number>(1);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<LeaderboardEntry[]>('/api/leaderboard');
      setEntries(Array.isArray(res.data) ? res.data : []);
    } catch {
      setError('Failed to load leaderboard. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLeaderboard();
  }, [fetchLeaderboard]);

  const handleModalConfirm = async (nickname: string) => {
    setModalOpen(false);
    setError(null);
    setSuccessMsg(null);

    try {
      await axios.post('/api/leaderboard', {
        nickname,
        score: scoreInput,
        gamesPlayed: gamesPlayedInput,
      });
      setSuccessMsg(`Score submitted! Good luck on the leaderboard, ${nickname}! 🎉`);
      await fetchLeaderboard();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data as { message?: string; error?: string };
        setError(data.message ?? data.error ?? 'Failed to submit score.');
      } else {
        setError('Failed to submit score. Please try again.');
      }
    }
  };

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.heading}>🏆 Leaderboard</h1>
        <p className={styles.subheading}>Top 10 voice quiz champions.</p>
      </div>

      {/* Error */}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      {/* Success */}
      {successMsg && (
        <div className={styles.successMsg} role="status">
          {successMsg}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className={styles.loadingWrapper} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          Loading leaderboard…
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table} aria-label="Leaderboard top 10">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Nickname</th>
                <th scope="col">Score</th>
                <th scope="col">Games Played</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.emptyState}>
                    No scores yet. Be the first! 🎯
                  </td>
                </tr>
              ) : (
                entries.map((entry, index) => {
                  const rank = index + 1;
                  const rankClass = RANK_CLASSES[rank] ?? styles.rankCell;
                  return (
                    <tr key={`${entry.nickname}-${rank}`}>
                      <td className={`${styles.rankCell} ${rankClass}`}>
                        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                      </td>
                      <td className={styles.nicknameCell}>{entry.nickname}</td>
                      <td className={styles.scoreCell}>{entry.score}</td>
                      <td>{entry.gamesPlayed ?? '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Submit score section */}
      <div className={styles.submitSection}>
        <h2 className={styles.submitTitle}>Submit My Score</h2>
        <div className={styles.inputRow}>
          <label className={styles.inputLabel}>
            Score
            <input
              type="number"
              className={styles.numberInput}
              value={scoreInput}
              min={0}
              onChange={(e) => setScoreInput(Math.max(0, parseInt(e.target.value, 10) || 0))}
              aria-label="Your score"
            />
          </label>
          <label className={styles.inputLabel}>
            Games Played
            <input
              type="number"
              className={styles.numberInput}
              value={gamesPlayedInput}
              min={1}
              onChange={(e) =>
                setGamesPlayedInput(Math.max(1, parseInt(e.target.value, 10) || 1))
              }
              aria-label="Games played"
            />
          </label>
          <button
            type="button"
            className={styles.submitBtn}
            onClick={() => setModalOpen(true)}
            style={{ alignSelf: 'flex-end' }}
          >
            🏆 Submit Score
          </button>
        </div>
      </div>

      {/* Nickname modal */}
      <NicknameModal
        isOpen={modalOpen}
        onConfirm={(nickname) => void handleModalConfirm(nickname)}
        onCancel={() => setModalOpen(false)}
      />
    </div>
  );
};

export default LeaderboardView;
