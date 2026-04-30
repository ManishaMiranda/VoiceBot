import React, { useState } from 'react';
import { isAxiosError } from 'axios';
import AudioPlayer from '../components/AudioPlayer';
import QuizResult from '../components/QuizResult';
import { api } from '../api/client';

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
      const res = await api.startQuiz();
      setRound(res.data);
    } catch (err) {
      if (isAxiosError(err) && err.response?.data) {
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
      const res = await api.answerQuiz(round.roundId, guess, 'player');
      setAnswerResult(res.data);
    } catch (err) {
      if (isAxiosError(err) && err.response?.data) {
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
          🎯 Voice Quiz
        </h1>
        <p style={{ fontSize: '1rem', color: '#64748b', margin: '0.25rem 0 0' }}>
          Listen to the clip and guess which colleague is speaking!
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

      {/* Loading state */}
      {loadingRound && (
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
          Loading quiz round…
        </div>
      )}

      {/* Start screen */}
      {!round && !loadingRound && !answerResult && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.5rem',
            padding: '3rem 2rem',
            background: '#f8fafc',
            border: '2px dashed #cbd5e1',
            borderRadius: 16,
            textAlign: 'center',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: '3rem' }}>🎤</span>
          <p style={{ fontSize: '1rem', color: '#64748b', maxWidth: 320, margin: 0 }}>
            A random colleague will say something. Can you guess who it is?
          </p>
          <button
            type="button"
            className="cvb-btn-primary"
            onClick={startQuiz}
            style={{
              padding: '0.85rem 2.5rem',
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'opacity 0.15s, transform 0.1s',
            }}
          >
            Start Quiz
          </button>
        </div>
      )}

      {/* Active round */}
      {round && !answerResult && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {/* Mode label */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.3rem 0.75rem',
              borderRadius: 999,
              fontSize: '0.8rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              alignSelf: 'flex-start',
              background: round.mode === 'singing' ? '#fef9c3' : '#ede9fe',
              color: round.mode === 'singing' ? '#a16207' : '#5b21b6',
            }}
          >
            {round.mode === 'singing' ? '🎵 Singing Round' : '🎤 Spoken Round'}
          </span>

          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', margin: 0 }}>
            Who is speaking?
          </p>

          <AudioPlayer audioUrl={round.audioUrl} label="Listen to the clip" />

          <div
            role="group"
            aria-label="Answer options"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: '0.6rem',
            }}
          >
            {round.options.map((option) => (
              <button
                key={option}
                type="button"
                className="cvb-option-btn"
                onClick={() => void submitAnswer(option)}
                disabled={submittingAnswer}
                style={{
                  padding: '0.65rem 0.75rem',
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  color: '#374151',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s, transform 0.1s',
                  textAlign: 'center',
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Result */}
      {answerResult && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <QuizResult
            correct={answerResult.correct}
            correctColleagueId={answerResult.correctColleagueId}
            score={answerResult.score}
          />
          <button
            type="button"
            className="cvb-play-again-btn"
            onClick={handlePlayAgain}
            style={{
              padding: '0.75rem 2rem',
              background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
              alignSelf: 'flex-start',
            }}
          >
            🔄 Play Again
          </button>
        </div>
      )}
    </div>
  );
};

export default VoiceQuizView;
