"""Configuration du runtime vocal auto-hébergé (variables d'environnement)."""

import os
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv()


def env(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default)
    if value is None:
        raise RuntimeError(f"Variable d'environnement manquante : {name}")
    return value


# API Next.js (skills, prompts, sessions) — la seule source de logique métier
NEXT_API_URL = env("NEXT_API_URL", "http://localhost:3000")
RUNTIME_API_SECRET = env("RUNTIME_API_SECRET")

# Hôte public de CE serveur (pour les websockets média) : "example.com" sans schéma
PUBLIC_HOST = env("PUBLIC_HOST", "localhost:8000")

# Téléphonie : twilio | telnyx (OVH SIP : cible future)
TELEPHONY_PROVIDER = env("TELEPHONY_PROVIDER", "twilio")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")
TELNYX_API_KEY = os.getenv("TELNYX_API_KEY", "")

# STT local (faster-whisper) : tiny/base/small/medium/large — medium = bon FR sur CPU
WHISPER_MODEL = env("WHISPER_MODEL", "medium")
WHISPER_DEVICE = env("WHISPER_DEVICE", "auto")  # cpu | cuda | auto

# TTS (Piper) : une voix par langue. La langue de la session (renvoyée par
# /api/runtime/session) choisit la voix.
# Rétro-compat : l'ancienne variable PIPER_VOICE, si définie, sert de voix FR.
PIPER_VOICE_FR = env("PIPER_VOICE_FR", os.getenv("PIPER_VOICE") or "fr_FR-siwis-medium")
PIPER_VOICE_EN = env("PIPER_VOICE_EN", "en_US-lessac-medium")
PIPER_VOICE_ES = env("PIPER_VOICE_ES", "es_ES-davefx-medium")


def piper_voice_for(language: str) -> str:
    """Voix Piper correspondant à la langue de session ("fr" par défaut)."""
    return {"en": PIPER_VOICE_EN, "es": PIPER_VOICE_ES}.get(language, PIPER_VOICE_FR)


def check_piper_base_url(url: str) -> str:
    """Valide l'URL racine du serveur Piper, ou lève une RuntimeError explicite.

    Racine, pas route de synthèse : `piper-tts` publié (1.3 à 1.4.2, le seul
    installable) sert la synthèse sur `POST /`. La route `/synthesize` que
    documentent Pipecat et le dépôt de Piper n'existe que sur `master`, non
    publié — la viser donne un 404. On tape donc la racine, et `/voices` s'en
    déduit.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise RuntimeError(
            f"PIPER_BASE_URL doit être une URL http(s) absolue, racine du serveur "
            f"Piper — exemple : http://localhost:5000 (reçu : {url!r})."
        )
    return url.rstrip("/")


# Serveur Piper : processus séparé, lancé par l'opérateur (voir README). Le
# runtime n'embarque plus `piper-tts` ; il ne fait que l'appeler en HTTP.
PIPER_BASE_URL = check_piper_base_url(env("PIPER_BASE_URL", "http://localhost:5000"))

# Cerveau : ollama (100 % local) | mistral (API EU) | anthropic (qualité max)
LLM_PROVIDER = env("LLM_PROVIDER", "ollama")
OLLAMA_MODEL = env("OLLAMA_MODEL", "qwen2.5:7b")  # bon compromis FR + tool-calling
OLLAMA_URL = env("OLLAMA_URL", "http://localhost:11434/v1")
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "")
MISTRAL_MODEL = env("MISTRAL_MODEL", "mistral-small-latest")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = env("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
