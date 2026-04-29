/**
 * API client for the Colleague Voice Bot.
 *
 * In production (Netlify), each route calls its Lambda Function URL directly.
 * The URLs are injected at build time via Netlify environment variables.
 *
 * In development, calls go through the Vite proxy (/api/*) which forwards
 * to a local or deployed endpoint.
 *
 * Environment variables (set in Netlify dashboard or .env.local for dev):
 *   VITE_URL_UPLOAD_SAMPLE      — upload-sample Lambda Function URL
 *   VITE_URL_MANAGE_PROFILE     — manage-profile Lambda Function URL
 *   VITE_URL_SYNTHESIZE         — synthesize Lambda Function URL
 *   VITE_URL_QUOTE_GENERATOR    — quote-generator Lambda Function URL
 *   VITE_URL_QUIZ               — quiz Lambda Function URL
 *   VITE_URL_LEADERBOARD        — leaderboard Lambda Function URL
 */

import axios from 'axios';

const isDev = import.meta.env.DEV;

// In dev, use the Vite proxy (/api/...) so we don't need CORS config locally.
// In production, call Lambda Function URLs directly.
function lambdaUrl(envVar: string, devPath: string): string {
  if (isDev) return `/api${devPath}`;
  const url = import.meta.env[envVar] as string | undefined;
  if (!url) {
    console.warn(`Missing env var ${envVar} — falling back to /api${devPath}`);
    return `/api${devPath}`;
  }
  // Strip trailing slash
  return url.replace(/\/$/, '');
}

// ── Route base URLs ──────────────────────────────────────────────────────────

const UPLOAD_BASE    = lambdaUrl('VITE_URL_UPLOAD_SAMPLE',   '/admin/samples');
const PROFILE_BASE   = lambdaUrl('VITE_URL_MANAGE_PROFILE',  '/colleagues');
const SYNTHESIZE_URL = lambdaUrl('VITE_URL_SYNTHESIZE',      '/synthesize');
const QUOTE_URL      = lambdaUrl('VITE_URL_QUOTE_GENERATOR', '/quotes/random');
const QUIZ_BASE      = lambdaUrl('VITE_URL_QUIZ',            '/quiz');
const LEADERBOARD_URL= lambdaUrl('VITE_URL_LEADERBOARD',     '/leaderboard');

// ── API functions ────────────────────────────────────────────────────────────

export const api = {
  // Colleagues
  getColleagues: () =>
    axios.get(`${PROFILE_BASE}/colleagues`),

  // Admin — profiles
  getAdminProfiles: (token: string) =>
    axios.get(`${PROFILE_BASE}/admin/profiles`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  buildProfile: (colleagueId: string, token: string) =>
    axios.post(`${PROFILE_BASE}/admin/profiles/${colleagueId}/build`, null, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // Admin — samples
  uploadSample: (body: object, token: string) =>
    axios.post(`${UPLOAD_BASE}/admin/samples`, body, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  deleteSample: (sampleId: string, token: string) =>
    axios.delete(`${UPLOAD_BASE}/admin/samples/${sampleId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),

  // Synthesis
  synthesize: (body: { text: string; colleagueId: string; language: string; singing: boolean }) =>
    axios.post(SYNTHESIZE_URL, body),

  // Quotes
  getRandomQuote: (colleagueId: string) =>
    axios.post(QUOTE_URL, { colleagueId }),

  // Quiz
  startQuiz: (nickname?: string) =>
    axios.post(`${QUIZ_BASE}/quiz/start`, { nickname }),

  answerQuiz: (roundId: string, guess: string, nickname?: string) =>
    axios.post(`${QUIZ_BASE}/quiz/answer`, { roundId, guess, nickname }),

  // Leaderboard
  getLeaderboard: () =>
    axios.get(LEADERBOARD_URL),

  submitScore: (nickname: string, score: number, gamesPlayed: number) =>
    axios.post(LEADERBOARD_URL, { nickname, score, gamesPlayed }),
};
