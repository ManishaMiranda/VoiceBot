import React, { useCallback, useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import NicknameModal from '../components/NicknameModal';
import { api } from '../api/client';

interface LeaderboardEntry {
  nickname: string;
  score: number;
  gamesPlayed?: number;
}

const RANK_COLORS: Record<number, string> = {
  1: '#f59e0b',
  2: '#94a3b8',
  3: '#b45309',
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
      const res = await api.getLeaderboard();
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
      await api.submitScore(nickname, scoreInput, gamesPlayedInput);
      setSuccessMsg(`Score submitted! Good luck on the leaderboard, ${nickname}! 🎉`);
      await fetchLeaderboard();
    } catch (err) {
      if (isAxiosError(err) && err.response?.data) {
        const data = err.response.data as { message?: string; error?: string };
        setError(data.message ?? data.error ?? 'Failed to submit score.');
      } else {
        setError('Failed to submit score. Please try again.');
      }
    }
  };

  return (
    <div
      style={{
        maxWidth: 700,
        margin: '0 auto',
        padding: '2rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
      }}
    >
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
          🏆 Leaderboard
        </h1>
        <p style={{ fontSize: '1rem', color: '#64748b', margin: '0.25rem 0 0' }}>
          Top 10 voice quiz champions.
        </p>
      </div>

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

      {/* Success */}
      {successMsg && (
        <div
          role="status"
          style={{
            padding: '0.75rem 1rem',
            background: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: 8,
            color: '#15803d',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: '#64748b',
            fontSize: '0.9rem',
            padding: '1rem',
          }}
        >
          <span
            className="cvb-spin"
            aria-hidden="true"
            style={{
              width: 20,
              height: 20,
              border: '2px solid #cbd5e1',
              borderTopColor: '#7c3aed',
              borderRadius: '50%',
              display: 'inline-block',
            }}
          />
          Loading leaderboard…
        </div>
      ) : (
        <div
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          <table
            className="cvb-table"
            aria-label="Leaderboard top 10"
            style={{ width: '100%', borderCollapse: 'collapse' }}
          >
            <thead>
              <tr>
                {['Rank', 'Nickname', 'Score', 'Games Played'].map((col) => (
                  <th
                    key={col}
                    scope="col"
                    style={{
                      background: '#f8fafc',
                      padding: '0.75rem 1rem',
                      textAlign: 'left',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: '3rem',
                      textAlign: 'center',
                      color: '#94a3b8',
                      fontSize: '0.9rem',
                    }}
                  >
                    No scores yet. Be the first! 🎯
                  </td>
                </tr>
              ) : (
                entries.map((entry, index) => {
                  const rank = index + 1;
                  const rankColor = RANK_COLORS[rank] ?? '#7c3aed';
                  return (
                    <tr key={`${entry.nickname}-${rank}`}>
                      <td
                        style={{
                          padding: '0.875rem 1rem',
                          fontSize: '0.9rem',
                          borderBottom: '1px solid #f1f5f9',
                          fontWeight: 700,
                          color: rankColor,
                          width: 48,
                        }}
                      >
                        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                      </td>
                      <td
                        style={{
                          padding: '0.875rem 1rem',
                          fontSize: '0.9rem',
                          borderBottom: '1px solid #f1f5f9',
                          fontWeight: 600,
                          color: '#1e293b',
                        }}
                      >
                        {entry.nickname}
                      </td>
                      <td
                        style={{
                          padding: '0.875rem 1rem',
                          fontSize: '0.9rem',
                          borderBottom: '1px solid #f1f5f9',
                          fontWeight: 700,
                          color: '#7c3aed',
                        }}
                      >
                        {entry.score}
                      </td>
                      <td
                        style={{
                          padding: '0.875rem 1rem',
                          fontSize: '0.9rem',
                          color: '#374151',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        {entry.gamesPlayed ?? '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Submit score section */}
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
          Submit My Score
        </h2>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#64748b',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
            }}
          >
            Score
            <input
              type="number"
              className="cvb-number-input"
              value={scoreInput}
              min={0}
              onChange={(e) => setScoreInput(Math.max(0, parseInt(e.target.value, 10) || 0))}
              aria-label="Your score"
              style={{
                padding: '0.6rem 0.75rem',
                border: '1.5px solid #d1d5db',
                borderRadius: 8,
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                color: '#1e293b',
                width: 120,
                transition: 'border-color 0.15s',
              }}
            />
          </label>
          <label
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#64748b',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3rem',
            }}
          >
            Games Played
            <input
              type="number"
              className="cvb-number-input"
              value={gamesPlayedInput}
              min={1}
              onChange={(e) =>
                setGamesPlayedInput(Math.max(1, parseInt(e.target.value, 10) || 1))
              }
              aria-label="Games played"
              style={{
                padding: '0.6rem 0.75rem',
                border: '1.5px solid #d1d5db',
                borderRadius: 8,
                fontSize: '0.9rem',
                fontFamily: 'inherit',
                color: '#1e293b',
                width: 120,
                transition: 'border-color 0.15s',
              }}
            />
          </label>
          <button
            type="button"
            className="cvb-submit-btn"
            onClick={() => setModalOpen(true)}
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
              whiteSpace: 'nowrap',
              alignSelf: 'flex-end',
            }}
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
