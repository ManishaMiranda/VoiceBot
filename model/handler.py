"""
handler.py — XTTS v2 inference handler for the Colleague Voice Bot SageMaker container.

The XTTS v2 model is loaded once at module import time so that every subsequent
call to `synthesize()` reuses the already-loaded model, keeping per-request
latency low.

Supported languages: en (English), fr (French), hi (Hindi).
"""

import io
import logging
import os
import wave

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

# ---------------------------------------------------------------------------
# Supported languages
# ---------------------------------------------------------------------------

SUPPORTED_LANGUAGES = {"en", "fr", "hi"}

# ---------------------------------------------------------------------------
# Model loading — happens once when the container starts
# ---------------------------------------------------------------------------

logger.info("Loading XTTS v2 model …")

try:
    from TTS.api import TTS  # type: ignore

    # Use GPU if available; fall back to CPU gracefully
    _USE_GPU = os.environ.get("USE_GPU", "auto").lower()
    if _USE_GPU == "auto":
        try:
            import torch  # type: ignore

            _gpu = torch.cuda.is_available()
        except ImportError:
            _gpu = False
    else:
        _gpu = _USE_GPU == "true"

    _tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=_gpu)
    logger.info("XTTS v2 model loaded successfully (gpu=%s)", _gpu)

except Exception as exc:  # pragma: no cover — model loading failure is fatal
    logger.exception("Failed to load XTTS v2 model: %s", exc)
    raise


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------


def synthesize(
    text: str,
    speaker_wav_paths: list[str],
    language: str,
    singing: bool,
) -> bytes:
    """Synthesize speech and return raw WAV bytes.

    Parameters
    ----------
    text:
        The text to synthesize.  Must be 1–500 characters (1–200 for singing).
    speaker_wav_paths:
        Local filesystem paths to speaker reference WAV files.  At least one
        path is required.
    language:
        BCP-47 language code.  Must be one of ``en``, ``fr``, ``hi``.
    singing:
        When ``True`` the text is wrapped in musical notation hints before
        synthesis.  XTTS v2 does not natively support singing; this is a
        best-effort approach that produces a more melodic output.

    Returns
    -------
    bytes
        Raw WAV audio bytes (not base64-encoded — the Flask layer handles
        encoding).

    Raises
    ------
    ValueError
        If ``language`` is not supported or ``speaker_wav_paths`` is empty.
    RuntimeError
        If the XTTS v2 model raises an unexpected error during inference.
    """

    # ── Input validation ────────────────────────────────────────────────────

    if language not in SUPPORTED_LANGUAGES:
        raise ValueError(
            f"Unsupported language '{language}'. "
            f"Supported languages: {sorted(SUPPORTED_LANGUAGES)}"
        )

    if not speaker_wav_paths:
        raise ValueError("At least one speaker WAV path is required.")

    if not text or not text.strip():
        raise ValueError("Text must not be empty.")

    # ── Singing mode: prepend musical notation hints ────────────────────────

    synthesis_text = f"♪ {text} ♪" if singing else text

    logger.info(
        "Synthesizing: language=%s singing=%s text_len=%d speaker_files=%d",
        language,
        singing,
        len(synthesis_text),
        len(speaker_wav_paths),
    )

    # ── Run XTTS v2 inference ───────────────────────────────────────────────

    try:
        # tts_to_file writes to a file; we use a temp buffer via tts() instead
        # so we can return bytes without touching the filesystem.
        wav_array = _tts.tts(
            text=synthesis_text,
            speaker_wav=speaker_wav_paths,
            language=language,
        )
    except Exception as exc:
        logger.exception("XTTS v2 inference failed: %s", exc)
        raise RuntimeError(f"XTTS v2 inference failed: {exc}") from exc

    # ── Convert numpy array → WAV bytes ────────────────────────────────────

    wav_bytes = _array_to_wav_bytes(wav_array, sample_rate=24000)

    logger.info("Synthesis complete: output_bytes=%d", len(wav_bytes))
    return wav_bytes


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _array_to_wav_bytes(audio_array, sample_rate: int = 24000) -> bytes:
    """Convert a numpy float32 audio array to raw WAV bytes."""
    # Ensure float32 in [-1, 1]
    audio = np.array(audio_array, dtype=np.float32)
    audio = np.clip(audio, -1.0, 1.0)

    buffer = io.BytesIO()
    sf.write(buffer, audio, samplerate=sample_rate, format="WAV", subtype="PCM_16")
    buffer.seek(0)
    return buffer.read()
