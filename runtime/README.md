# Runtime vocal auto-hébergé

Remplace Vapi (option B du doc d'architecture) : tout tourne sur **votre** serveur,
sauf l'incompressible — l'opérateur téléphonique (Twilio ou Telnyx en trunk).

```
téléphone ⇄ opérateur (Twilio/Telnyx) ⇄ WS média ⇄ ce serveur :
  VAD Silero (local) → faster-whisper FR/EN (local) → LLM → Piper FR/EN (local)
                                             │
                                             └── outils → API Next.js (/api/tools/execute)
```

**Aucune logique métier ici** : prompts, skills, PIN, consentements viennent de
l'API Next.js. Ce serveur ne fait que l'audio temps réel.

## Installation (serveur EU, ex. Hetzner CX32 ~10 €/mois)

```bash
cd runtime
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # remplir

# LLM 100 % local (recommandé pour commencer) :
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:7b          # bon tool-calling en français

uvicorn server:app --host 0.0.0.0 --port 8000
```

Premier lancement : faster-whisper (~1,5 Go) et la voix Piper se téléchargent seuls.
En dev : `ngrok http 8000` puis mettre l'hôte ngrok dans `PUBLIC_HOST`.

## Branchement opérateur

- **Twilio** : sur le numéro, webhook Voice → `POST https://HOTE/twilio/inbound`.
- **Telnyx** : application TeXML → `POST https://HOTE/telnyx/inbound`
  (sortant Telnyx : pas encore implémenté, utiliser Twilio pour les missions).

Côté `web/.env.local` : `RUNTIME=selfhost`, `RUNTIME_URL=https://HOTE`,
`RUNTIME_API_SECRET=` (même valeur que dans `.env` ici).

## Choix du cerveau (LLM_PROVIDER)

| Valeur | Dépendance externe | Qualité tool-calling FR | Coût |
|---|---|---|---|
| `ollama` | aucune (local) | correcte (qwen2.5:7b) — à tester sérieusement | 0 € |
| `mistral` | API Mistral (France 🇫🇷, données EU) | bonne | ~cents/appel |
| `anthropic` | API Anthropic (US, DPA nécessaire) | la meilleure | ~cents/appel |

## Langues (FR / EN)

L'API Next.js renvoie la langue de la session dans `POST /api/runtime/session`
(`"language": "fr" | "en"` ; défaut `fr` si absent). Le runtime s'en sert pour :

- **STT** : faster-whisper est épinglé sur la langue de session — pas
  d'auto-détection, le `WhisperSTTService` de Pipecat exige une langue concrète.
- **TTS** : la voix Piper correspondante est choisie à l'ouverture de l'appel :
  `PIPER_VOICE_FR` (défaut `fr_FR-siwis-medium`) ou `PIPER_VOICE_EN`
  (défaut `en_US-lessac-medium`). L'ancienne variable `PIPER_VOICE` reste
  acceptée : si elle est définie, elle sert de voix FR.

**Limite assumée** : les voix Piper sont monolingues. Si l'appelant change de
langue en cours d'appel, la voix de session est conservée (l'agent parlera avec
un accent) et la transcription de l'autre langue sera dégradée puisque Whisper
est épinglé. Le changement de voix/langue en cours d'appel est un
« good first issue ».

## Limites connues (v1)

- **DTMF sortant** (« tapez 1 ») non géré en self-host : les serveurs vocaux
  ne peuvent pas être navigués. Le runtime Vapi (`RUNTIME=vapi`) le fait.
- Latence : compter 1,5–2,5 s sur CPU (whisper medium). Passer `WHISPER_MODEL=small`
  ou un GPU pour descendre vers ~1 s. Vapi fait mieux (~0,8 s) si la démo l'exige.
