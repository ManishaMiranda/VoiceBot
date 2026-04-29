"""
serve.py — Flask serving layer for the Colleague Voice Bot SageMaker container.

SageMaker real-time inference protocol:
  GET  /ping         → 200 {"status": "healthy"}   (health check)
                     → 200 {"status": "loading"}   (model still loading — still 200 so
                                                     SageMaker doesn't kill the container)
  POST /invocations  → 200 {audio_base64, sample_rate, duration_seconds}
                     → 503 {"error": "Model is still loading, retry shortly"}

The XTTS v2 model takes 2-5 minutes to load. We start Flask immediately and
load the model in a background thread so SageMaker's /ping health check passes
right away. Inference requests return 503 until the model is ready.

Environment variables:
  AUDIO_BUCKET_NAME    — S3 bucket that holds speaker reference WAV files
  AWS_DEFAULT_REGION   — AWS region (default: us-east-1)
"""

import base64
import io
import logging
import os
import tempfile
import threading
import wave as wave_module

import boto3
from flask import Flask, Response, jsonify, request

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

AUDIO_BUCKET_NAME: str = os.environ.get("AUDIO_BUCKET_NAME", "")
AWS_REGION: str = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
SUPPORTED_LANGUAGES = {"en", "fr", "hi"}

# ---------------------------------------------------------------------------
# S3 client
# ---------------------------------------------------------------------------

_s3_client = boto3.client("s3", region_name=AWS_REGION)

# ---------------------------------------------------------------------------
# Model state — loaded in background thread
# ---------------------------------------------------------------------------

_model_ready = threading.Event()
_model_error: str | None = None
_tts = None  # set by _load_model_background()


def _load_model_background() -> None:
    """Load the XTTS v2 model in a background thread."""
    global _tts, _model_error
    logger.info("Background thread: loading XTTS v2 model …")
    try:
        from TTS.api import TTS  # type: ignore
        import torch  # type: ignore

        gpu = torch.cuda.is_available()
        logger.info("CUDA available: %s", gpu)
        _tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=gpu)
        logger.info("XTTS v2 model loaded successfully (gpu=%s)", gpu)
    except Exception as exc:
        _model_error = str(exc)
        logger.exception("Failed to load XTTS v2 model: %s", exc)
    finally:
        # Signal ready regardless — /ping will report the error if loading failed
        _model_ready.set()


# Start loading immediately when the module is imported
_loader_thread = threading.Thread(target=_load_model_background, daemon=True)
_loader_thread.start()

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/ping", methods=["GET"])
def ping() -> Response:
    """SageMaker health check.

    Always returns HTTP 200 so SageMaker doesn't kill the container while the
    model is loading. The 'status' field indicates whether the model is ready.
    """
    if _model_error:
        logger.error("GET /ping — model failed to load: %s", _model_error)
        return jsonify({"status": "error", "detail": _model_error}), 200

    if not _model_ready.is_set():
        logger.info("GET /ping — model still loading")
        return jsonify({"status": "loading"}), 200

    logger.info("GET /ping — healthy")
    return jsonify({"status": "healthy"}), 200


@app.route("/invocations", methods=["POST"])
def invocations() -> Response:
    """SageMaker inference endpoint."""
    logger.info("POST /invocations — inference request")

    # Return 503 while model is loading
    if not _model_ready.is_set():
        return _error(503, "Model is still loading. Please retry in a moment.")

    if _model_error:
        return _error(500, f"Model failed to load: {_model_error}")

    # ── Parse request body ──────────────────────────────────────────────────

    if not request.is_json:
        return _error(400, "Request body must be JSON (Content-Type: application/json)")

    try:
        body = request.get_json(force=True)
    except Exception as exc:
        return _error(400, f"Invalid JSON body: {exc}")

    text = body.get("text")
    speaker_wav_keys = body.get("speaker_wav_keys")
    language = body.get("language", "en")
    singing = bool(body.get("singing", False))

    if not text or not isinstance(text, str) or not text.strip():
        return _error(400, "Field 'text' is required and must be a non-empty string.")

    if not speaker_wav_keys or not isinstance(speaker_wav_keys, list):
        return _error(400, "Field 'speaker_wav_keys' is required and must be a non-empty list.")

    if language not in SUPPORTED_LANGUAGES:
        return _error(400, f"Unsupported language '{language}'. Supported: {sorted(SUPPORTED_LANGUAGES)}")

    if not AUDIO_BUCKET_NAME:
        return _error(500, "Server misconfiguration: AUDIO_BUCKET_NAME is not set.")

    # ── Fetch speaker WAV files from S3 ─────────────────────────────────────

    tmp_wav_paths: list[str] = []
    tmp_files = []

    try:
        for s3_key in speaker_wav_keys:
            logger.info("Fetching s3://%s/%s", AUDIO_BUCKET_NAME, s3_key)
            try:
                tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
                tmp_files.append(tmp)
                _s3_client.download_fileobj(AUDIO_BUCKET_NAME, s3_key, tmp)
                tmp.flush()
                tmp_wav_paths.append(tmp.name)
            except Exception as exc:
                logger.error("Failed to fetch %s: %s", s3_key, exc)
                return _error(500, f"Failed to fetch speaker WAV '{s3_key}': {exc}")

        # ── Run inference ───────────────────────────────────────────────────

        synthesis_text = f"♪ {text} ♪" if singing else text

        try:
            import numpy as np
            import soundfile as sf

            wav_array = _tts.tts(
                text=synthesis_text,
                speaker_wav=tmp_wav_paths,
                language=language,
            )

            # Convert numpy array → WAV bytes
            audio = np.array(wav_array, dtype=np.float32)
            audio = np.clip(audio, -1.0, 1.0)
            buf = io.BytesIO()
            sf.write(buf, audio, samplerate=24000, format="WAV", subtype="PCM_16")
            buf.seek(0)
            wav_bytes = buf.read()

        except Exception as exc:
            logger.exception("Inference failed: %s", exc)
            return _error(500, f"Inference error: {exc}")

        # ── Compute duration ────────────────────────────────────────────────

        sample_rate, duration_seconds = _wav_metadata(wav_bytes)

        audio_base64 = base64.b64encode(wav_bytes).decode("utf-8")
        logger.info("Inference complete: %.2fs, %d bytes", duration_seconds, len(wav_bytes))

        return jsonify({
            "audio_base64": audio_base64,
            "sample_rate": sample_rate,
            "duration_seconds": duration_seconds,
        }), 200

    finally:
        for tmp in tmp_files:
            try:
                tmp.close()
                os.unlink(tmp.name)
            except OSError:
                pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _error(status_code: int, message: str) -> Response:
    return jsonify({"error": message}), status_code


def _wav_metadata(wav_bytes: bytes) -> tuple[int, float]:
    try:
        with wave_module.open(io.BytesIO(wav_bytes)) as wf:
            sr = wf.getframerate()
            dur = wf.getnframes() / float(sr) if sr > 0 else 0.0
        return sr, dur
    except Exception:
        return 24000, 0.0
