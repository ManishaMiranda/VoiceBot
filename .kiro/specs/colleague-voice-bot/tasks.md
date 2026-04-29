# Implementation Plan: Colleague Voice Bot

## Overview

Incremental implementation of the Colleague Voice Bot on AWS. Tasks are ordered so each step produces working, testable code before the next begins. Infrastructure is laid first, then the model container, then Lambda handlers (with property tests alongside each), then the React UI, and finally integration, smoke tests, and CI/CD.

All Lambda functions and tests are written in **TypeScript**. Property-based tests use **fast-check** with a minimum of 100 iterations per property. AWS infrastructure is defined with **AWS CDK** (TypeScript).

---

## Tasks

- [x] 1. Repository scaffold and shared tooling
  - Initialise a monorepo with the following workspace packages: `infra/` (CDK), `backend/` (Lambda handlers + shared utils), `frontend/` (React/Vite), `tests/` (property, integration, smoke)
  - Add `tsconfig.json`, `eslint`, `prettier`, and `jest` (with `ts-jest`) configs at the root
  - Add `aws-sdk-client-mock`, `fast-check`, `@aws-sdk/client-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/client-sagemaker-runtime` as shared dev/prod dependencies
  - _Requirements: all_

- [x] 2. Shared backend utilities
  - [x] 2.1 Implement validation helpers
    - Create `backend/src/utils/validation.ts` with `validateAudioFormat`, `validateDuration`, `validateTextLength`, `validateSingingTextLength`, `validateLanguageCode`
    - Each function returns `{ valid: boolean; message?: string; field?: string; constraint?: string }`
    - _Requirements: 1.1, 1.3, 1.4, 3.3, 3.4, 6.2, 6.4, 7.2, 7.3_

  - [ ]* 2.2 Write property tests for audio format and duration validation (Properties 1, 3)
    - **Property 1: Audio format validation** — arbitrary strings accepted iff in `{mp3, wav, m4a}`
    - **Property 3: Duration bounds validation** — floats accepted iff in [10, 300]
    - Tag: `// Feature: colleague-voice-bot, Property 1` and `Property 3`
    - _Requirements: 1.1, 1.3, 1.4_

  - [ ]* 2.3 Write property tests for text length and language code validation (Properties 8, 14, 16)
    - **Property 8: Synthesis text length validation** — strings accepted iff length in [1, 500]
    - **Property 14: Language code validation** — strings accepted iff in `{en, fr, hi}`
    - **Property 16: Singing mode text length validation** — strings accepted iff length in [1, 200]
    - Tag: `// Feature: colleague-voice-bot, Property 8`, `Property 14`, `Property 16`
    - _Requirements: 3.3, 3.4, 6.2, 6.4, 7.2, 7.3_

  - [x] 2.4 Implement cache key computation
    - Create `backend/src/utils/cacheKey.ts` — `computeCacheKey(text, colleagueId, lang, singing): string`
    - Normalise text to lowercase before hashing; use Node.js `crypto.createHash('sha256')`
    - _Requirements: 3.6, 6.5_

  - [ ]* 2.5 Write property tests for cache key computation (Property 11)
    - **Property 11: Synthesis caching idempotence** — same inputs always produce the same key; `"Hello"` and `"hello"` produce the same key
    - Tag: `// Feature: colleague-voice-bot, Property 11`
    - _Requirements: 3.6, 6.5_

  - [x] 2.6 Implement checksum utility
    - Create `backend/src/utils/checksum.ts` — `computeChecksum(buffer: Buffer): string` returning SHA-256 hex digest
    - _Requirements: 10.2, 10.3_

  - [ ]* 2.7 Write property tests for checksum utility (Properties 27, 28)
    - **Property 27: Checksum storage on upload** — for any buffer, `computeChecksum` returns a 64-char hex string equal to the SHA-256 digest
    - **Property 28: Checksum integrity enforcement** — mismatched digest detected correctly
    - Tag: `// Feature: colleague-voice-bot, Property 27`, `Property 28`
    - _Requirements: 10.2, 10.3, 10.4_

  - [x] 2.8 Implement DynamoDB retry with exponential backoff
    - Create `backend/src/utils/dynamoRetry.ts` — `withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelayMs = 100): Promise<T>`
    - Implements exponential backoff with jitter; throws after all retries exhausted
    - _Requirements: (error handling — DynamoDB throttling)_

  - [x] 2.9 Implement custom error classes
    - Create `backend/src/utils/errors.ts` with `ValidationError`, `NotReadyError`, `ChecksumMismatchError`, `SampleLimitError`, `BuildInProgressError`
    - Each class implements `toResponse()` returning the structured JSON error body from the design
    - _Requirements: 1.1–1.6, 3.2–3.4, 7.2, 7.3, 9.1–9.3, 10.4_

- [ ] 3. Checkpoint — shared utilities
  - Ensure all unit and property tests in `backend/src/utils/` pass. Ask the user if questions arise.

- [x] 4. AWS CDK infrastructure — storage and auth
  - [x] 4.1 Create CDK stack for S3 buckets and DynamoDB tables
    - In `infra/lib/storage-stack.ts`: define `colleague-voice-bot-audio-{accountId}` (private, versioning on) and `colleague-voice-bot-ui-{accountId}` (private, OAC)
    - Define all five DynamoDB tables (`VoiceProfiles`, `VoiceSamples`, `SynthesisCache`, `QuizScores`, `QuoteLibrary`) with on-demand billing, keys, GSIs, and TTL as specified in the design
    - _Requirements: 1.2, 3.5, 3.6, 5.7, 9.5, 10.1_

  - [x] 4.2 Create CDK stack for Cognito User Pool
    - In `infra/lib/auth-stack.ts`: define `colleague-voice-bot-admins` User Pool, app client (no client secret), and `admins` group
    - Export User Pool ID and App Client ID as stack outputs
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 4.3 Create CDK stack for API Gateway HTTP API
    - In `infra/lib/api-stack.ts`: define all public and admin routes from the design's route table
    - Attach Cognito JWT authorizer to admin routes; no authorizer on public routes
    - Wire Lambda integrations (stubs acceptable at this stage — real handlers added in task 6)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 4.4 Create CDK stack for CloudFront distribution
    - In `infra/lib/cdn-stack.ts`: Origin 1 → UI S3 bucket (OAC), Origin 2 → API Gateway at `/api/*` (path rewrite)
    - Enforce HTTPS-only; set TTL=0 cache behaviour for `/audio/*`
    - _Requirements: 8.1, 8.6, 9.5_

- [x] 5. SageMaker model container
  - [x] 5.1 Write Dockerfile for XTTS v2 inference container
    - Create `model/Dockerfile` based on the official Coqui XTTS v2 image
    - Add a Flask/FastAPI `/invocations` endpoint that accepts the JSON payload from the design and returns `{ audio_base64, sample_rate, duration_seconds }`
    - Add a `/ping` health-check endpoint returning HTTP 200
    - _Requirements: 2.2, 3.1_

  - [x] 5.2 Write container inference handler (`model/handler.py`)
    - Load XTTS v2 model at container start; fetch speaker WAV files from S3 using the IAM role
    - Handle `language` and `singing` parameters; return base64-encoded WAV
    - _Requirements: 3.1, 6.1, 6.3, 7.1, 7.5_

  - [x] 5.3 Add CDK construct for ECR repository and SageMaker endpoint
    - In `infra/lib/sagemaker-stack.ts`: define ECR repo, `DockerImageAsset` build, SageMaker Model + EndpointConfig + Endpoint (`ml.g4dn.xlarge`, single instance)
    - Attach IAM role granting S3 read access to the audio bucket
    - _Requirements: 2.2, 3.1_

- [x] 6. Lambda handler — upload-sample
  - [x] 6.1 Implement `upload-sample` Lambda handler
    - Create `backend/src/handlers/upload-sample.ts`
    - Validate format (mp3/wav/m4a), duration [10, 300 s], sample count cap (≤ 10 per colleague)
    - Compute SHA-256 checksum; store file in S3 under `samples/{colleagueId}/{sampleId}.{ext}`
    - Write `VoiceSamples` DynamoDB record; return `{ sampleId, colleagueId }`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 10.1, 10.2_

  - [ ]* 6.2 Write property tests for upload-sample (Properties 1, 2, 3, 4, 5, 26, 27)
    - **Property 1: Audio format validation**
    - **Property 2: S3 key namespace invariant** — stored key starts with `samples/{colleagueId}/`
    - **Property 3: Duration bounds validation**
    - **Property 4: Sample count cap per colleague** — 11th upload rejected, count stays at 10
    - **Property 5: Upload response completeness** — response contains non-empty `sampleId` and matching `colleagueId`
    - **Property 26: Voice sample storage round-trip** — S3 mock returns identical bytes
    - **Property 27: Checksum storage on upload**
    - Tag each with `// Feature: colleague-voice-bot, Property N`
    - _Requirements: 1.1–1.6, 10.1, 10.2_

  - [ ]* 6.3 Write unit tests for upload-sample handler
    - Happy path: valid WAV, 30 s → 201 with sampleId
    - Error paths: unsupported format, too short, too long, 11th sample
    - _Requirements: 1.1–1.6_

- [x] 7. Lambda handler — manage-profile
  - [x] 7.1 Implement `manage-profile` Lambda handler
    - Create `backend/src/handlers/manage-profile.ts`
    - `POST /admin/profiles/{colleagueId}/build`: verify ≥ 1 sample exists; set status `processing`; verify checksums of all samples; invoke SageMaker; update status to `ready` or `failed`
    - `GET /admin/profiles` and `GET /colleagues`: read `VoiceProfiles` table and return list
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 10.3, 10.4_

  - [ ]* 7.2 Write property tests for manage-profile (Properties 6, 7, 28)
    - **Property 6: Profile build status transitions** — success → `ready`; error → `failed` with non-empty `errorDetails`
    - **Property 7: Profile build precondition** — 0 samples → rejected; ≥ 1 sample → accepted
    - **Property 28: Checksum integrity enforcement** — mismatched digest → build rejected with integrity error
    - Tag: `// Feature: colleague-voice-bot, Property 6`, `Property 7`, `Property 28`
    - _Requirements: 2.1, 2.3, 2.4, 10.3, 10.4_

  - [ ]* 7.3 Write unit tests for manage-profile handler
    - Happy path: build triggered, SageMaker returns success → status `ready`
    - Error path: SageMaker error → status `failed`, errorDetails populated
    - Error path: zero samples → 422
    - _Requirements: 2.1–2.5_

- [x] 8. Lambda handler — synthesize
  - [x] 8.1 Implement `synthesize` Lambda handler
    - Create `backend/src/handlers/synthesize.ts`
    - Validate text length [1, 500] (standard) or [1, 200] (singing); validate language code
    - Check `SynthesisCache` table; on hit return pre-signed URL; on miss invoke SageMaker, store audio in `synthesized/{colleagueId}/{cacheKey}.wav`, write cache entry (TTL = now + 3600), return pre-signed URL (24 h)
    - Require profile status `ready`; return 422 otherwise
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 8.2 Write property tests for synthesize (Properties 8, 9, 10, 11, 14, 15, 16, 17, 25)
    - **Property 8: Synthesis text length validation**
    - **Property 9: Synthesis requires ready profile**
    - **Property 10: Synthesis storage and URL round-trip** — URL contains `X-Amz-Signature`
    - **Property 11: Synthesis caching idempotence** — same inputs within 1 h → same S3 key, SageMaker invoked once
    - **Property 14: Language code validation**
    - **Property 15: Language parameter forwarding** — SageMaker mock receives exact language code
    - **Property 16: Singing mode text length validation**
    - **Property 17: Singing mode parameter forwarding** — SageMaker mock receives `singing=true`
    - **Property 25: Pre-signed URL enforcement** — URL contains `X-Amz-Signature` query param
    - Tag each with `// Feature: colleague-voice-bot, Property N`
    - _Requirements: 3.1–3.6, 6.1–6.5, 7.1–7.5_

  - [ ]* 8.3 Write unit tests for synthesize handler
    - Happy path: cache miss → SageMaker invoked → audio stored → URL returned
    - Happy path: cache hit → SageMaker NOT invoked → cached URL returned
    - Error paths: text too long, singing text too long, unsupported language, profile not ready
    - _Requirements: 3.1–3.6, 6.1–6.5, 7.1–7.5_

- [ ] 9. Checkpoint — core Lambda handlers
  - Ensure all tests for upload-sample, manage-profile, and synthesize pass. Ask the user if questions arise.

- [x] 10. Quote library seed data
  - [x] 10.1 Create quote seed script
    - Create `backend/src/data/quotes.ts` with an array of ≥ 50 office-humor quotes (covering `office`, `meetings`, `technology`, `general` categories)
    - Create `backend/scripts/seed-quotes.ts` that writes all quotes to the `QuoteLibrary` DynamoDB table using `BatchWriteItem`
    - _Requirements: 4.2_

  - [x] 10.2 Implement quote non-repetition logic
    - Create `backend/src/utils/quoteSelector.ts` — `selectQuote(colleagueId, allQuotes, recentQuoteIds): Quote`
    - Maintains a sliding window of 5 recent quote IDs per colleague (stored in DynamoDB as `{colleagueId}:recent`)
    - _Requirements: 4.3_

  - [ ]* 10.3 Write property tests for quote non-repetition (Property 12)
    - **Property 12: Quote non-repetition** — for any sequence of ≥ 6 consecutive calls, no quote at position N appeared in positions N-5 through N-1
    - Tag: `// Feature: colleague-voice-bot, Property 12`
    - _Requirements: 4.3_

- [x] 11. Lambda handler — quote-generator
  - [x] 11.1 Implement `quote-generator` Lambda handler
    - Create `backend/src/handlers/quote-generator.ts`
    - Select non-repeating quote via `quoteSelector`; delegate to `synthesize` handler logic; return `{ quoteText, audioUrl }`
    - Return 422 if profile not ready
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 11.2 Write property tests for quote-generator (Properties 12, 13)
    - **Property 12: Quote non-repetition** (end-to-end via handler mock)
    - **Property 13: Quote response completeness** — response always contains non-empty `quoteText` and `audioUrl`
    - Tag: `// Feature: colleague-voice-bot, Property 12`, `Property 13`
    - _Requirements: 4.3, 4.5_

  - [ ]* 11.3 Write unit tests for quote-generator handler
    - Happy path: quote selected, synthesized, both fields returned
    - Error path: profile not ready → 422
    - _Requirements: 4.1, 4.4, 4.5_

- [x] 12. Lambda handler — quiz
  - [x] 12.1 Implement `quiz` Lambda handler
    - Create `backend/src/handlers/quiz.ts`
    - `POST /quiz/start`: select random `ready` colleague; pick random quote; synthesize (spoken or singing, chosen randomly); store round in `QuizScores` table; return `{ audioUrl, options: [7 colleague names], mode, roundId }`
    - `POST /quiz/answer`: look up round; evaluate guess; if correct increment score by 1; if incorrect include correct name; return result
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 7.5, 7.6_

  - [ ]* 12.2 Write property tests for quiz (Properties 18, 19, 20)
    - **Property 18: Quiz round structure** — response contains exactly 7 options, a `mode` field (`spoken`|`singing`), and an `audioUrl`
    - **Property 19: Quiz only selects ready colleagues** — selected colleague always has `ready` status
    - **Property 20: Quiz evaluation correctness** — correct guess → score +1; incorrect guess → score unchanged + correct name revealed
    - Tag: `// Feature: colleague-voice-bot, Property 18`, `Property 19`, `Property 20`
    - _Requirements: 5.1–5.6, 7.5, 7.6_

  - [ ]* 12.3 Write unit tests for quiz handler
    - Happy path: start round → answer correctly → score incremented
    - Happy path: start round → answer incorrectly → correct name returned
    - Edge case: no ready colleagues → error response
    - _Requirements: 5.1–5.6_

- [x] 13. Lambda handler — leaderboard
  - [x] 13.1 Implement `leaderboard` Lambda handler
    - Create `backend/src/handlers/leaderboard.ts`
    - `GET /leaderboard`: query `LeaderboardIndex` GSI with `ScanIndexForward=false`, `Limit=10`; return array of `{ nickname, score }`
    - `POST /leaderboard`: write entry with `leaderboard="global"` constant; no auth required
    - `DELETE /admin/leaderboard/{entry}`: admin-only delete
    - _Requirements: 5.7, 5.8, 5.9_

  - [ ]* 13.2 Write property tests for leaderboard (Properties 21, 22)
    - **Property 21: Leaderboard ordering and completeness** — GET returns ≤ 10 entries, each with `nickname` and `score`, ordered by score descending
    - **Property 22: Unauthenticated leaderboard submission** — POST without Authorization header returns 2xx and entry is in DynamoDB
    - Tag: `// Feature: colleague-voice-bot, Property 21`, `Property 22`
    - _Requirements: 5.7, 5.8, 5.9_

  - [ ]* 13.3 Write unit tests for leaderboard handler
    - Happy path: submit score → appears in top-10 GET response
    - Edge case: > 10 entries → only top 10 returned, ordered correctly
    - _Requirements: 5.7–5.9_

- [ ] 14. Security property tests
  - [ ]* 14.1 Write property tests for admin endpoint authentication (Property 23)
    - **Property 23: Admin endpoint authentication** — any request without valid JWT → 401; valid JWT without admin group → 403
    - Tag: `// Feature: colleague-voice-bot, Property 23`
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 14.2 Write property tests for public endpoint accessibility (Property 24)
    - **Property 24: Public endpoint accessibility** — any request to public endpoints without Authorization header → not 401 or 403
    - Tag: `// Feature: colleague-voice-bot, Property 24`
    - _Requirements: 9.4_

- [ ] 15. Checkpoint — all Lambda handlers and property tests
  - Ensure all handler unit tests and all 28 property tests pass. Ask the user if questions arise.

- [x] 16. React web UI — project setup and shared components
  - [x] 16.1 Scaffold React/Vite/TypeScript frontend
    - Create `frontend/` with Vite + React + TypeScript template
    - Add `axios` (or `fetch` wrapper), a UI component library (e.g. shadcn/ui or Chakra UI), and `react-router-dom`
    - Configure Vite proxy to forward `/api/*` to the local API Gateway URL during development
    - _Requirements: 8.1, 8.6_

  - [x] 16.2 Implement ColleagueCard component
    - `frontend/src/components/ColleagueCard.tsx` — displays colleague name and availability status badge (`ready` / `processing` / `pending` / `failed`)
    - _Requirements: 8.2_

  - [x] 16.3 Implement AudioPlayer component
    - `frontend/src/components/AudioPlayer.tsx` — in-browser audio player that accepts a pre-signed URL; shows loading spinner while fetching
    - _Requirements: 8.3, 8.4_

  - [ ]* 16.4 Write unit tests for ColleagueCard and AudioPlayer
    - Test status badge rendering for all four statuses
    - Test AudioPlayer renders controls when URL is provided
    - _Requirements: 8.2, 8.3_

- [x] 17. React web UI — synthesis and quote generator views
  - [x] 17.1 Implement SynthesisForm component
    - `frontend/src/components/SynthesisForm.tsx` — text input (500-char limit), colleague selector, language dropdown (`en`/`fr`/`hi`), singing mode toggle, submit button with loading indicator
    - On submit: POST `/api/synthesize`; render AudioPlayer with returned URL
    - _Requirements: 8.1, 8.3, 8.4_

  - [x] 17.2 Implement SingingDisclaimer component
    - `frontend/src/components/SingingDisclaimer.tsx` — displays disclaimer banner when singing mode result is shown
    - _Requirements: 7.7_

  - [x] 17.3 Implement QuoteGeneratorView
    - `frontend/src/views/QuoteGeneratorView.tsx` — colleague selector, "Generate Quote" button; displays quote text and AudioPlayer
    - _Requirements: 4.1, 4.5, 8.1_

  - [ ]* 17.4 Write unit tests for SynthesisForm and SingingDisclaimer
    - Test character counter updates; test singing toggle shows disclaimer on result
    - _Requirements: 7.7, 8.4_

- [x] 18. React web UI — quiz game and leaderboard views
  - [x] 18.1 Implement VoiceQuizView
    - `frontend/src/views/VoiceQuizView.tsx` — "Start Quiz" button; renders AudioPlayer for clip; shows 7 colleague-name buttons; labels clip as spoken or singing round
    - _Requirements: 5.1–5.3, 7.6, 8.1_

  - [x] 18.2 Implement QuizResult component with animation
    - `frontend/src/components/QuizResult.tsx` — animated correct/incorrect result display (CSS transition or Framer Motion); shows correct colleague name on wrong answer
    - _Requirements: 5.4–5.6, 8.5_

  - [x] 18.3 Implement NicknameModal component
    - `frontend/src/components/NicknameModal.tsx` — modal dialog prompting for nickname before leaderboard submission
    - _Requirements: 8.7_

  - [x] 18.4 Implement LeaderboardView
    - `frontend/src/views/LeaderboardView.tsx` — fetches GET `/api/leaderboard`; renders top-10 table; "Submit Score" button opens NicknameModal then POSTs to `/api/leaderboard`
    - _Requirements: 5.7–5.9, 8.7_

  - [ ]* 18.5 Write unit tests for QuizResult and NicknameModal
    - Test correct/incorrect animation classes applied; test modal opens on submit and closes on cancel
    - _Requirements: 8.5, 8.7_

- [x] 19. React web UI — app shell and routing
  - [x] 19.1 Implement App shell with navigation
    - `frontend/src/App.tsx` — top-level router with routes: `/` (SynthesisForm), `/quotes` (QuoteGeneratorView), `/quiz` (VoiceQuizView), `/leaderboard` (LeaderboardView)
    - Responsive nav bar; mobile-friendly layout
    - _Requirements: 8.1, 8.6_

  - [x] 19.2 Wire frontend build into CDK UI stack
    - In `infra/lib/cdn-stack.ts`: add `BucketDeployment` construct to sync `frontend/dist/` to the UI S3 bucket after `vite build`
    - _Requirements: 8.1_

- [ ] 20. Checkpoint — web UI
  - Ensure all UI unit tests pass and the app renders correctly in a local Vite dev server. Ask the user if questions arise.

- [x] 21. Integration tests
  - [x] 21.1 Write end-to-end upload → profile build → synthesis integration test
    - `tests/integration/e2e-flow.test.ts` — using LocalStack or a deployed dev environment: upload sample → trigger profile build → synthesize text → verify audio URL returned
    - _Requirements: 2.2, 3.1, 3.5, 10.1_

  - [ ]* 21.2 Write SageMaker endpoint invocation integration test
    - `tests/integration/sagemaker.test.ts` — verify invocation payload structure matches design spec; verify base64 audio returned
    - _Requirements: 2.2, 3.1, 6.3, 7.5_

  - [ ]* 21.3 Write DynamoDB TTL cache expiry integration test
    - `tests/integration/cache-ttl.test.ts` — write a cache entry with `ttl` in the past; verify it is not returned on subsequent synthesize call
    - _Requirements: 3.6_

- [x] 22. Smoke tests
  - [x] 22.1 Write post-deployment smoke tests
    - `tests/smoke/deployment.smoke.test.ts`:
      - CloudFront URL returns HTTP 200 with HTML content
      - S3 audio bucket has `BlockPublicAcls=true` and `BlockPublicPolicy=true`
      - `VoiceProfiles` table contains exactly 7 entries
      - `QuoteLibrary` table contains ≥ 50 entries
      - SageMaker endpoint status is `InService`
    - _Requirements: 8.1, 4.2, 2.6, 9.5_

- [x] 23. CI/CD pipeline
  - [x] 23.1 Create GitHub Actions workflow for CI
    - `.github/workflows/ci.yml`: on push/PR — install deps, run `tsc --noEmit`, run all unit and property tests (`jest --testPathPattern="unit|property"`), build frontend (`vite build`)
    - _Requirements: (all — quality gate)_

  - [x] 23.2 Create GitHub Actions workflow for deployment
    - `.github/workflows/deploy.yml`: on push to `main` — build Docker image, push to ECR, run `cdk deploy --all`, run seed-quotes script, run smoke tests
    - _Requirements: (all — deployment)_

- [ ] 24. Final checkpoint — full test suite
  - Run the complete test suite (unit, property, integration). Ensure all 28 property tests pass and all unit tests pass. Ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints at tasks 3, 9, 15, 20, and 24 ensure incremental validation
- All 28 correctness properties from the design are covered by property-based tests using fast-check (minimum 100 iterations each)
- SageMaker and DynamoDB calls are mocked with `aws-sdk-client-mock` in unit and property tests
- The SageMaker endpoint (`ml.g4dn.xlarge`) incurs GPU costs — keep it stopped in non-production environments
