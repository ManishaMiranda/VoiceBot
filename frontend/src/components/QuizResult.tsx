import React from 'react';

export interface QuizResultProps {
  correct: boolean;
  correctColleagueId: string;
  score: number;
}

const QuizResult: React.FC<QuizResultProps> = ({ correct, correctColleagueId, score }) => {
  return (
    <div
      role="status"
      aria-live="assertive"
      aria-atomic="true"
      className="cvb-pop-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '1.5rem',
        borderRadius: 16,
        textAlign: 'center',
        background: correct ? '#f0fdf4' : '#fff1f2',
        border: correct ? '2px solid #86efac' : '2px solid #fda4af',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontSize: '3rem',
          lineHeight: 1,
          color: correct ? '#16a34a' : '#dc2626',
        }}
      >
        {correct ? '✓' : '✗'}
      </span>

      {correct ? (
        <>
          <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
            Correct! 🎉
          </p>
          <p style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500, margin: 0 }}>
            Score: {score}
          </p>
        </>
      ) : (
        <>
          <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
            Wrong!
          </p>
          <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>
            It was <strong style={{ color: '#1e293b' }}>{correctColleagueId}</strong>
          </p>
          <p style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500, margin: 0 }}>
            Score: {score}
          </p>
        </>
      )}
    </div>
  );
};

export default QuizResult;
