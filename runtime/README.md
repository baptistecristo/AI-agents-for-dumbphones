# Runtime vocal auto-hébergé

Remplace Vapi (option B du doc d'architecture) : tout tourne sur **votre** serveur,
sauf l'incompressible — l'opérateur téléphonique (Twilio ou Telnyx en trunk).

```
téléphone ⇄ opérateur (Twilio/Telnyx) ⇄ WS média ⇄ ce serveur :
  VAD Silero (local) → faster-whisper FR/EN/ES (local) → LLM → Piper FR/EN/ES (serveur local)
                                             │
                                             └── outils → API Next.js (/api/tools/execute)
```

**Aucune logique métier ici** : prompts, skills, auth d'appel, consentements viennent
de l'API Next.js. Ce serveur ne fait que l'audio temps réel. Le code jetable part par
SMS depuis l'API, jamais d'ici : ce runtime ne décide pas ce qui est protégé.

Piper est le seul morceau qui tourne à côté, dans son propre serveur : le runtime
lui parle en HTTP et n'installe pas `piper-tts` (GPL-3.0-or-later). Voir
`piper_http.py` et l'issue #26.

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

Premier lancement : faster-whisper (~1,5 Go) se télécharge seul.
En dev : `ngrok http 8000` puis mettre l'hôte ngrok dans `PUBLIC_HOST`.

## Le serveur Piper (TTS)

À lancer à côté du runtime, dans son propre environnement — c'est ce qui garde
`piper-tts` (GPL-3.0-or-later) hors des dépendances de ce dossier :

```bash
python3 -m venv .venv-piper && source .venv-piper/bin/activate
pip install "piper-tts[http]"

# Les TROIS voix doivent être sur le disque : le serveur n'en précharge qu'une,
# mais il sert les autres à la demande depuis son --data-dir.
python -m piper.download_voices fr_FR-siwis-medium en_US-lessac-medium es_ES-davefx-medium

python -m piper.http_server -m fr_FR-siwis-medium   # écoute sur :5000
```

Un seul serveur suffit pour les trois langues : le runtime envoie la voix voulue
à chaque requête, et Piper la charge depuis son `--data-dir` (par défaut le
répertoire courant — d'où le `download_voices` ci-dessus, lancé au même endroit).

⚠️ **Une voix absente ne provoque pas d'erreur.** Piper journalise un WARNING,
retombe sur la voix de `-m` et répond 200 : un appel en anglais sortirait dans la
voix française, et rien d'autre ne le signalerait. Le runtime interroge donc
`GET /voices` au démarrage et refuse de se lancer si une voix configurée manque.
Piper simplement injoignable ne bloque pas le démarrage (il finit peut-être de
démarrer) : c'est alors l'appel qui échouera, avec un message nommant l'URL.

`PIPER_BASE_URL` est la **racine** du serveur (`http://localhost:5000`), jamais
une route : le runtime en dérive `GET /voices` **et** la route de synthèse. Y
coller `/synthesize` casserait les deux, et le démarrage le refuse.

### La route de synthèse a changé en 1.5.0

| `piper-tts` | Synthèse | Ce que fait `/` |
|---|---|---|
| 1.3 à 1.4.2 | `POST /` | la synthèse elle-même |
| 1.5.0 et plus (17/07/2026) | `POST /synthesize` | page de test, `GET` seulement |

`pip install "piper-tts[http]"` installe aujourd'hui la 1.5.0 : un runtime qui
viserait `/` en dur récolterait un **405 à chaque synthèse**. Le runtime résout
donc la route lui-même au démarrage (`PIPER_SYNTHESIZE_PATH=auto`, le défaut) :
il sonde les deux formes en `OPTIONS`, garde celle qui accepte `POST`, et refuse
de démarrer si aucune ne répond. Les deux versions marchent sans rien régler.

Ce contrôle est distinct de celui des voix, et il faut les deux : `GET /voices`
existe à l'identique dans toutes les versions, il laisserait donc démarrer un
runtime dont aucune synthèse ne passe.

Pour épingler la route (proxy devant Piper qui empêche la détection) :
`PIPER_SYNTHESIZE_PATH=/synthesize` ou `PIPER_SYNTHESIZE_PATH=/`. Une valeur
épinglée fausse est refusée au démarrage elle aussi, pas au premier appel.

⚠️ L'image `linuxserver/piper` ne convient pas : elle emballe l'ancien Piper de
Rhasspy et parle le protocole Wyoming sur le port 10200, pas cette API HTTP.
`OHF-Voice/piper1-gpl` fournit un `Dockerfile` (`docker build -t piper-tts .`,
puis `docker run -p 5000:5000 piper-tts server -m fr_FR-siwis-medium`).
Le `compose.yaml` de la racine fait tout ça pour vous (section suivante).

## Avec Docker (compose)

`compose.yaml`, à la racine du dépôt, monte le runtime et son serveur Piper
ensemble. C'est le chemin le plus court : il fait à votre place le venv, le
téléchargement des voix et le câblage des deux processus.

```bash
cp runtime/.env.example runtime/.env   # puis remplir RUNTIME_API_SECRET au minimum
docker compose up --build
```

Le premier démarrage est long : construction de l'image de Piper depuis la
source, téléchargement des trois voix, puis du modèle faster-whisper (~1,5 Go
en `medium`) au premier appel. Les deux derniers atterrissent dans des volumes,
donc une seule fois.

| Service | Rôle | Exposé |
|---|---|---|
| `piper-voices` | Télécharge les trois voix dans le volume, puis sort. `piper` attend qu'il ait réussi. | non |
| `piper` | Serveur TTS. Image construite depuis `OHF-Voice/piper1-gpl` (tag épinglé). | non, réseau interne seulement |
| `runtime` | Ce dossier : FastAPI, Pipecat, STT, LLM. | `:8000` |

Piper n'a **aucune authentification** : il reste sur le réseau interne, sans
`ports:`, joignable du seul runtime. Le port 8000 du runtime est le seul ouvert
sur l'hôte, parce que l'opérateur téléphonique doit l'atteindre.

Les deux conteneurs tournent sans capacité (`cap_drop: ALL`) et avec
`no-new-privileges` ; le runtime tourne en utilisateur non root (UID 10001) et
porte un `HEALTHCHECK` sur `/health`.

### Ce qui n'est pas dans le compose

L'API Next.js (`web/`) et Ollama tournent **sur l'hôte**, pas ici. Dans un
conteneur, `localhost` désigne le conteneur lui-même : `NEXT_API_URL` et
`OLLAMA_URL` sont donc réécrits vers `host.docker.internal`. Si le web est
déployé ailleurs (Vercel), mettez son URL publique dans `.env` et retirez la
ligne `NEXT_API_URL` du `compose.yaml`.

### Les voix arrivent par un volume

Elles ne sont pas dans l'image d'OHF-Voice : son entrypoint les lit dans
`/data`. Le service `piper-voices` les y dépose une fois pour toutes dans le
volume `piper-voices`, avant que le serveur ne démarre. Changer une voix
suppose donc de relancer ce service :

```bash
docker compose run --rm piper-voices download fr_FR-tom-medium
docker compose up -d --force-recreate piper
```

Les modèles de voix ne sont pas sous GPL : `fr_FR-siwis-medium` est sous licence
MIT, son corpus d'entraînement sous CC-BY 4.0. Ils ne relèvent pas de la
séparation décrite ci-dessous.

### Pourquoi Piper garde son image à lui

Une contrainte de licence, pas un goût pour les microservices.
`piper-tts` est en GPL-3.0-or-later et ce dépôt en Apache-2.0 : la
compatibilité ne va que dans un sens, du code GPL ne peut pas entrer dans un
artefact Apache-2.0. Un fichier compose qui **nomme** une source tierce ne
distribue rien, exactement comme une ligne de `requirements.txt`. Une image du
runtime qui **embarquerait** `piper-tts` distribuerait, elle, et les
obligations de la GPL-3.0 s'attacheraient à cette image.

Le `Dockerfile` du runtime le vérifie plutôt que d'y compter : sa dernière
étape de construction échoue si `pip show piper-tts` réussit. La CI fait le
même contrôle sur l'arbre de dépendances.

Construire l'image de Piper sur votre machine ne distribue rien non plus : la
GPL-3.0 §0 exclut « executing it on a computer ». Ce qui distribuerait, c'est
pousser une image vers un registre. La CI de ce dépôt construit l'image du
runtime pour vérifier qu'elle tient debout, et ne la pousse nulle part : aucun
job ne se connecte à un registre. Détail complet dans l'issue #26.

⚠️ **Sortir Piper ne suffit pas à rendre cette image publiable.**
`pyyaml-include` est lui aussi en GPL-3.0-or-later, et c'est une dépendance de
**base** de `pipecat-ai` (`pyyaml-include<2,>=1.4`), pas un extra facultatif :
il est donc dans l'image. Le code n'est pas importé par le runtime (ni `bot`
ni `server` ne le chargent), mais il est bien présent sur le disque, et
publier l'image le distribuerait.

Rien n'est distribué aujourd'hui, puisque rien n'est poussé. Le problème est
latent, de la même famille que l'import Piper en processus avant l'#28 : il
faudra le trancher avant qu'une image parte vers un registre. L'étape
d'inventaire du `Dockerfile` l'imprime à chaque construction pour qu'il reste
sous les yeux.

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

## Langues (FR / EN / ES)

L'API Next.js renvoie la langue de la session dans `POST /api/runtime/session`
(`"language": "fr" | "en" | "es"` ; défaut `fr` si absent). Le runtime s'en sert pour :

- **STT** : faster-whisper est épinglé sur la langue de session — pas
  d'auto-détection, le `WhisperSTTService` de Pipecat exige une langue concrète.
- **TTS** : la voix Piper correspondante est choisie à l'ouverture de l'appel :
  `PIPER_VOICE_FR` (défaut `fr_FR-siwis-medium`), `PIPER_VOICE_EN`
  (défaut `en_US-lessac-medium`) ou `PIPER_VOICE_ES` (défaut
  `es_ES-davefx-medium`). L'ancienne variable `PIPER_VOICE` reste
  acceptée : si elle est définie, elle sert de voix FR.

**Limite assumée** : les voix Piper sont monolingues. Si l'appelant change de
langue en cours d'appel, la voix de session est conservée (l'agent parlera avec
un accent) et la transcription de l'autre langue sera dégradée puisque Whisper
est épinglé. Le changement de voix/langue en cours d'appel est un
« good first issue ».

## Limites connues (v1)

- **DTMF sortant** (« tapez 1 ») pas encore câblé : ce runtime ne navigue pas les
  serveurs vocaux. Pipecat fournit les deux moitiés, elles ne sont pas branchées
  dans `bot.py` : `OutputDTMFFrame` passe par `BaseOutputTransport.write_dtmf`,
  qui pousse les tons dans le flux audio quand le transport n'a pas de DTMF natif
  (media stream Twilio compris), et `IVRNavigator`
  (`pipecat.extensions.ivr.ivr_navigator`) choisit la touche. Le runtime Vapi
  (`RUNTIME=vapi`) le fait déjà.
- Latence : compter 1,5–2,5 s sur CPU (whisper medium). Passer `WHISPER_MODEL=small`
  ou un GPU pour descendre vers ~1 s. Vapi fait mieux (~0,8 s) si la démo l'exige.
