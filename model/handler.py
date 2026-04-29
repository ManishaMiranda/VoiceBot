"""
handler.py — XTTS v2 inference utilities.

Model loading is handled by serve.py in a background thread.
This module only contains helper functions used by serve.py.
"""

# This file is intentionally minimal — the model (_tts) is owned by serve.py
# and passed directly to tts() calls there. This module exists for any shared
# utilities that may be needed in future.
