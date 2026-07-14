"""Configuration du runtime vocal auto-hébergé (variables d'environnement)."""

import os

from dotenv import load_dotenv

load_dotenv()


def env(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default)
    if value is None:
        raise RuntimeError(f"Variable d'environnement manquante : {name}")
    return value


def env_optional(name: str, default: str | None = None) -> str | None:
    return os.getenv(name, default)


# API Next.js (skills, prompts, sessions) — la seule source de logique métier
NEXT_API_URL = env("NEXT_API_URL", "http://localhost:3000")
RUNTIME_API_SECRET = env_optional("RUNTIME_API_SECRET", "") or ""

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

# TTS local (Piper) : voix française, téléchargée automatiquement au 1er appel
DEFAULT_PIPER_VOICE = env("PIPER_VOICE", "fr_FR-siwis-medium")
ENGLISH_PIPER_VOICE = env("ENGLISH_PIPER_VOICE", "en_US-lessac-medium")

# Cerveau : ollama (100 % local) | mistral (API EU) | anthropic (qualité max)
LLM_PROVIDER = env("LLM_PROVIDER", "ollama")
OLLAMA_MODEL = env("OLLAMA_MODEL", "qwen2.5:7b")  # bon compromis FR + tool-calling
OLLAMA_URL = env("OLLAMA_URL", "http://localhost:11434/v1")
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "")
MISTRAL_MODEL = env("MISTRAL_MODEL", "mistral-small-latest")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = env("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")


def resolve_stt_language(language: str | None) -> str:
    if not language:
        return "auto"
    normalized = language.lower()
    if normalized.startswith("en"):
        return "en"
    if normalized.startswith("fr"):
        return "fr"
    return "auto"


def resolve_tts_voice(language: str | None) -> str:
    if not language:
        return DEFAULT_PIPER_VOICE
    normalized = language.lower()
    if normalized.startswith("en"):
        return ENGLISH_PIPER_VOICE
    return DEFAULT_PIPER_VOICE

