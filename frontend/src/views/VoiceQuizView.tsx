import React, { useState } from 'react';
import axios from 'axios';
import AudioPlayer from '../components/AudioPlayer';
import QuizResult from '../components/QuizResult';
import styles from './VoiceQuizView.module.css';

interface QuizRound {
  roundId: string;
  audioUrl: string;
  options: string[];
  mode: 'spoken' | 'singing';
}

interface QuizAnswerResponse {
  correct: boolean;
  correctColleagueId: string;
  score: number;
}

const VoiceQuizView: React.FC = () => {
  const [round, setRound] = useState<QuizRound | null>(null);
  const [loadingRound, setLoadingRound] = useState(false);
  const [answerResult, setAnswerResult] = useState<QuizAnswerResponse | null>(null);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startQuiz = async () => {
    setLoadingRound(true);
    setError(null);
    setRound(null);
    setAnswerResult(null);

    try {
      const res = await axios.post<QuizRound>('/api/quiz/start');
      setRound(res.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data as { message?: string; error?: string };
        setError(data.message ?? data.error ?? 'Failed to start quiz. Please try again.');
      } else {
        setError('Failed to start quiz. Please try again.');
      }
    } finally {
      setLoadingRound(false);
    }
  };

  const submitAnswer = async (guess: string) => {
    if (!round || submittingAnswer) return;

    setSubmittingAnswer(true);
    setError(null);

    try {
      const res = await axios.post<QuizAnswerResponse>('/api/quiz/answer', {
        roundId: round.roundId,
        guess,
        nickname: 'player',
      });
      setAnswerResult(res.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data as { message?: string; error?: string };
        setError(data.message ?? data.error ?? 'Failed to submit answer. Please try again.');
      } else {
        setError('Failed to submit answer. Please try again.');
      }
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handlePlayAgain = () => {
    setRound(null);
    setAnswerResult(null);
    setError(null);
  };

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.heading}>🎯 Voice Quiz</h1>
        <p className={styles.subheading}>
          Listen to the clip and guess which colleague is speaking!
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loadingRound && (
        <div className={styles.loadingText} role="status" aria-live="polite">
          <span className={styles.loadingSpinner} aria-hidden="true" />
          Loading quiz round…
        </div>
      )}

      {/* Start screen */}
      {!round && !loadingRound && !answerResult && (
        <div className={styles.startSection}>
          <span className={styles.startEmoji} aria-hidden="true">🎤</span>
          <p className={styles.startText}>
            A random colleague will say something. Can you guess who it is?
          </p>
          <button type="button" className={styles.startBtn} onClick={startQuiz}>
            Start Quiz
          </button>
        </div>
      )}

      {/* Active round */}
      {round && !answerResult && (
        <div className={styles.roundCard}>
          {/* Mode label */}
          <span
            className={`${styles.modeLabel} ${
              round.mode === 'singing' ? styles.modeSinging : styles.modeSpoken
            }`}
          >
            {round.mode === 'singing' ? '🎵 Singing Round' : '🎤 Spoken Round'}
          </span>

          <p className={styles.questionText}>Who is speaking?</p>

          <AudioPlayer audioUrl={round.audioUrl} label="Listen to the clip" />

          <div
            className={styles.optionsGrid}
            role="group"
            aria-label="Answer options"
          >
            {round.options.map((option) => (
              <button
                key={option}
                type="button"
                className={styles.optionBtn}
                onClick={() => void submitAnswer(option)}
                disabled={submittingAnswer}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Result */}
      {answerResult && (
        <div className={styles.roundCard}>
          <QuizResult
            correct={answerResult.correct}
            correctColleagueId={answerResult.correctColleagueId}
            score={answerResult.score}
          />
          <button type="button" className={styles.playAgainBtn} onClick={handlePlayAgain}>
            🔄 Play Again
          </button>
        </div>
      )}
    </div>
  );
};

export default VoiceQuizView;
