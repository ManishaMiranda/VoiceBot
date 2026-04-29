"""
serve.py — Flask serving layer for the Colleague Voice Bot SageMaker container.

SageMaker real-time inference protocol:
  GET  /ping         → 200 {"status": "healthy"}   (health check)
  POST /invocations  → 200 {audio_base64, sample_rate, duration_seconds}

Environment variables:
  AUDIO_BUCKET_NAME    — S3 bucket that holds speaker reference WAV files
  AWS_DEFAULT_REGION   — AWS region (default: us-east-1)
"""

import base64
import json
import logging
import os
import tempfile
import wave

import boto3
from flask import Flask, Response, jsonify, request

import handler

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

AUDIO_BUCKET_NAME: str = os.environ.get("AUDIO_BUCKET_NAME", "")
AWS_REGION: str = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")

SUPPORTED_LANGUAGES = {"en", "fr", "hi"}

# ---------------------------------------------------------------------------
# S3 client (module-level; reused across requests)
# ---------------------------------------------------------------------------

_s3_client = boto3.client("s3", region_name=AWS_REGION)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/ping", methods=["GET"])
def ping() -> Response:
    """SageMaker health check endpoint."""
    logger.info("GET /ping — health check")
    return jsonify({"status": "healthy"}), 200


@app.route("/invocations", methods=["POST"])
def invocations() -> Response:
    """SageMaker inference endpoint.

    Expected JSON body::

        {
            "text": "Hello, this is a test.",
            "speaker_wav_keys": ["samples/alice/s1.wav", "samples/alice/s2.wav"],
            "language": "en",
            "singing": false
        }

    Returns::

        {
            "audio_base64": "<base64-encoded WAV>",
            "sample_rate": 24000,
            "duration_seconds": 2.4
        }
    """
    logger.info("POST /invocations — inference request")

    # ── Parse request body ──────────────────────────────────────────────────

    if not request.is_json:
        logger.warning("Request Content-Type is not application/json")
        return _error(400, "Request body must be JSON (Content-Type: application/json)")

    try:
        body = request.get_json(force=True)
    except Exception as exc:
        logger.warning("Failed to parse JSON body: %s", exc)
        return _error(400, f"Invalid JSON body: {exc}")

    # ── Validate required fields ────────────────────────────────────────────

    text = body.get("text")
    speaker_wav_keys = body.get("speaker_wav_keys")
    language = body.get("language", "en")
    singing = bool(body.get("singing", False))

    if not text or not isinstance(text, str) or not text.strip():
        return _error(400, "Field 'text' is required and must be a non-empty string.")

    if not speaker_wav_keys or not isinstance(speaker_wav_keys, list) or len(speaker_wav_keys) == 0:
        return _error(400, "Field 'speaker_wav_keys' is required and must be a non-empty list.")

    if language not in SUPPORTED_LANGUAGES:
        return _error(
            400,
            f"Unsupported language '{language}'. "
            f"Supported languages: {sorted(SUPPORTED_LANGUAGES)}",
        )

    if not AUDIO_BUCKET_NAME:
        logger.error("AUDIO_BUCKET_NAME environment variable is not set")
        return _error(500, "Server misconfiguration: AUDIO_BUCKET_NAME is not set.")

    # ── Fetch speaker WAV files from S3 into temp files ─────────────────────

    tmp_wav_paths: list[str] = []
    tmp_files: list[tempfile.NamedTemporaryFile] = []

    try:
        for s3_key in speaker_wav_keys:
            logger.info("Fetching speaker WAV from s3://%s/%s", AUDIO_BUCKET_NAME, s3_key)
            try:
                tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
                tmp_files.append(tmp)
                _s3_client.download_fileobj(AUDIO_BUCKET_NAME, s3_key, tmp)
                tmp.flush()
                tmp_wav_paths.append(tmp.name)
            except Exception as exc:
                logger.error(
                    "Failed to fetch speaker WAV s3://%s/%s: %s",
                    AUDIO_BUCKET_NAME,
                    s3_key,
                    exc,
                )
                return _error(500, f"Failed to fetch speaker WAV '{s3_key}': {exc}")

        # ── Run inference ───────────────────────────────────────────────────

        try:
            wav_bytes = handler.synthesize(
                text=text,
                speaker_wav_paths=tmp_wav_paths,
                language=language,
                singing=singing,
            )
        except ValueError as exc:
            logger.warning("Validation error during synthesis: %s", exc)
            return _error(400, str(exc))
        except RuntimeError as exc:
            logger.error("Inference error: %s", exc)
            return _error(500, f"Inference error: {exc}")
        except Exception as exc:
            logger.exception("Unexpected error during synthesis: %s", exc)
            return _error(500, f"Unexpected inference error: {exc}")

        # ── Compute duration from WAV bytes ─────────────────────────────────

        sample_rate, duration_seconds = _wav_metadata(wav_bytes)

        # ── Encode and return ───────────────────────────────────────────────

        audio_base64 = base64.b64encode(wav_bytes).decode("utf-8")

        logger.info(
            "Inference complete: sample_rate=%d duration_seconds=%.2f audio_bytes=%d",
            sample_rate,
            duration_seconds,
            len(wav_bytes),
        )

        return jsonify(
            {
                "audio_base64": audio_base64,
                "sample_rate": sample_rate,
                "duration_seconds": duration_seconds,
            }
        ), 200

    finally:
        # Always clean up temp files
        for tmp in tmp_files:
            try:
                tmp.close()
                os.unlink(tmp.name)
            except OSError:
                pass


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _error(status_code: int, message: str) -> Response:
    """Return a JSON error response."""
    return jsonify({"error": message}), status_code


def _wav_metadata(wav_bytes: bytes) -> tuple[int, float]:
    """Extract sample rate and duration from raw WAV bytes.

    Returns
    -------
    (sample_rate, duration_seconds)
    """
    import io
    import wave as wave_module

    try:
        with wave_module.open(io.BytesIO(wav_bytes)) as wf:
            sample_rate = wf.getframerate()
            n_frames = wf.getnframes()
            duration_seconds = n_frames / float(sample_rate) if sample_rate > 0 else 0.0
        return sample_rate, duration_seconds
    except Exception as exc:
        logger.warning("Could not parse WAV metadata: %s — using defaults", exc)
        return 24000, 0.0
