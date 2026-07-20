"""Configuration du runtime vocal auto-hébergé (variables d'environnement)."""

import os
from urllib.parse import urlparse

from dotenv import load_dotenv

import piper_http

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
    """Valide l'URL RACINE du serveur Piper, ou lève une RuntimeError explicite.

    Racine, jamais route de synthèse : le runtime en dérive `/voices` (contrôle
    de démarrage) ET la route de synthèse (PIPER_SYNTHESIZE_PATH). Y coller la
    route de synthèse casse les deux, `/synthesize/voices` n'existant nulle part.

    La route se règle à part parce qu'elle a bougé : `POST /` de 1.3 à 1.4.2,
    `POST /synthesize` à partir de 1.5.0. Voir piper_http.py.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise RuntimeError(
            f"PIPER_BASE_URL doit être une URL http(s) absolue, racine du serveur "
            f"Piper — exemple : http://localhost:5000 (reçu : {url!r})."
        )

    trimmed = url.rstrip("/")
    # Confusion assez probable pour mériter son propre message : sans elle, le
    # démarrage échouerait plus loin, sur un GET /synthesize/voices en 404.
    if urlparse(trimmed).path.endswith(piper_http.SYNTHESIZE_PATH_CURRENT):
        raise RuntimeError(
            f"PIPER_BASE_URL doit être la RACINE du serveur Piper "
            f"(http://localhost:5000), pas la route de synthèse (reçu : {url!r}). "
            f"Pour changer la route, utilisez PIPER_SYNTHESIZE_PATH."
        )
    return trimmed


def check_piper_synthesize_path(value: str) -> str:
    """Normalise PIPER_SYNTHESIZE_PATH : "auto", ou une route commençant par "/".

    "auto" (défaut) laisse le runtime sonder le serveur au démarrage, ce qui
    couvre les deux formes sans que l'opérateur ait à savoir laquelle il fait
    tourner. Une valeur explicite est vérifiée au démarrage elle aussi : mal
    réglée, elle ne se verrait qu'en plein appel.
    """
    cleaned = value.strip()
    if cleaned.lower() == piper_http.SYNTHESIZE_PATH_AUTO:
        return piper_http.SYNTHESIZE_PATH_AUTO
    if not cleaned.startswith("/"):
        raise RuntimeError(
            f"PIPER_SYNTHESIZE_PATH doit valoir 'auto', "
            f"'{piper_http.SYNTHESIZE_PATH_CURRENT}' (piper-tts >= 1.5.0) ou "
            f"'{piper_http.SYNTHESIZE_PATH_LEGACY}' (1.3 à 1.4.2). Reçu : {value!r}."
        )
    return cleaned


# Serveur Piper : processus séparé, lancé par l'opérateur (voir README). Le
# runtime n'embarque plus `piper-tts` ; il ne fait que l'appeler en HTTP.
PIPER_BASE_URL = check_piper_base_url(env("PIPER_BASE_URL", "http://localhost:5000"))

# Route de synthèse. "auto" = détectée au démarrage par server.py, qui réécrit
# alors cette variable avec la route trouvée ; bot.py la lit à l'ouverture de
# chaque appel, donc après résolution.
PIPER_SYNTHESIZE_PATH = check_piper_synthesize_path(
    env("PIPER_SYNTHESIZE_PATH", piper_http.SYNTHESIZE_PATH_AUTO)
)

# Cerveau : ollama (100 % local) | mistral (API EU) | anthropic (qualité max)
LLM_PROVIDER = env("LLM_PROVIDER", "ollama")
OLLAMA_MODEL = env("OLLAMA_MODEL", "qwen2.5:7b")  # bon compromis FR + tool-calling
OLLAMA_URL = env("OLLAMA_URL", "http://localhost:11434/v1")
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "")
MISTRAL_MODEL = env("MISTRAL_MODEL", "mistral-small-latest")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = env("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
