import React from 'react';
import styles from './QuizResult.module.css';

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
      className={`${styles.result} ${correct ? styles.resultCorrect : styles.resultIncorrect}`}
    >
      <span
        className={`${styles.icon} ${correct ? styles.iconCorrect : styles.iconIncorrect}`}
        aria-hidden="true"
      >
        {correct ? '✓' : '✗'}
      </span>

      {correct ? (
        <>
          <p className={styles.message}>Correct! 🎉</p>
          <p className={styles.score}>Score: {score}</p>
        </>
      ) : (
        <>
          <p className={styles.message}>Wrong!</p>
          <p className={styles.correctName}>
            It was <strong>{correctColleagueId}</strong>
          </p>
          <p className={styles.score}>Score: {score}</p>
        </>
      )}
    </div>
  );
};

export default QuizResult;
