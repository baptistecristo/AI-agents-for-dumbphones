# Plateforme d'agent vocal pour téléphones simples

Un assistant qu'on appelle depuis un **téléphone à touches** (dumbphone) : il gère
l'agenda, les rappels, la météo, les itinéraires par SMS, retrouve les contacts —
et **passe les appels pénibles à la place de la personne** (médecin, taxi,
restaurant), avec compte-rendu par SMS. Toute l'intelligence est côté serveur ;
le téléphone reste un simple terminal vocal.

Spécification d'origine : [`voice-agent-architecture.md`](voice-agent-architecture.md) ·
Guide discovery : [`start-here.md`](start-here.md) · Prospects : [`prospects.csv`](prospects.csv)

## Ce qui est implémenté (Phase 0+ du doc d'archi)

| Plan | Choix | Où |
|---|---|---|
| Runtime vocal | **Auto-hébergé** (Pipecat + faster-whisper + Piper + Ollama/Mistral, option B du doc) — Vapi reste dispo en secours (`RUNTIME=vapi`) | `runtime/` + `web/src/lib/vapi.ts` |
| Téléphonie | Trunk **Twilio** (ou Telnyx) — l'incompressible : un numéro ne se self-host pas | `runtime/server.py` |
| SMS + OTP | **Twilio** (Messages + Verify) | `web/src/lib/twilio.ts` |
| Agent entrant | Prompt FR chaleureux/lent, confirmation avant action, PIN parlé | `web/src/lib/agents/inbound.ts` |
| Appels sortants | **Moteur généralisé** : presets Docteur / Taxi / Restaurant / générique, DTMF, répondeur, retries, compte-rendu SMS | `web/src/lib/agents/outbound.ts` + `api/cron/outbound` |
| Skills | agenda, rappels (+ « ai-je déjà… ? »), météo (Open-Meteo, gratuit), navigation-par-SMS (OpenRouteService), contacts, SMS dicté, mémoire, PIN | `web/src/lib/skills/` |
| Commandes SMS | `METEO`, `AGENDA`, `RAPPEL 18h30 …`, `RAPPELS`, `FAIT`, `DEJA`, `ROUTE`, `AIDE`, `STOP/START` — inspiré de [Sift](https://github.com/edleeman17/sift) | `web/src/lib/sms-commands.ts` |
| Données (EU) | Supabase Postgres : profils, téléphones, tokens OAuth **chiffrés AES-256-GCM**, registre de consentements append-only, rappels, mémoire, journaux d'appels/SMS, file d'appels sortants — RLS partout | `supabase/migrations/0001_init.sql` |
| Web/app | Next.js 16 : landing FR, connexion par lien magique, onboarding 4 étapes (OTP téléphone → Google OAuth → consentements → PIN), tableau de bord famille | `web/src/app/` |
| Sécurité | Caller-ID = identification ; **PIN parlé** pour les actions sensibles (le caller-ID se spoofe) ; confirmation orale en 2 temps ; contenu externe = données, jamais instructions | partout |

Le nom de l'agent est configurable : `AGENT_NAME` (voix) + `NEXT_PUBLIC_BRAND_NAME` (site).

## Architecture (rappel)

```
Dumbphone ──appel──▶ Numéro (Twilio via Vapi) ──▶ Vapi (STT Deepgram fr / LLM Claude / TTS 11labs)
                                                     │ tool-calls (webhook)
                                                     ▼
                                    Next.js  /api/vapi/webhook ──▶ skills ──▶ Google / Open-Meteo / ORS / Twilio SMS
                                                     │
                                                     ▼
                                        Supabase Postgres (EU)
   Famille ──▶ site web (landing / onboarding / tableau de bord)
   Crons (1 min) : rappels SMS · file d'appels sortants
```

## Mise en route, de zéro à l'appel

### 1. Comptes à créer
1. **Supabase** — projet en **région EU**. Récupérer URL + anon key + service_role key.
2. **Twilio** — SID + token. Créer un service **Verify** (OTP). Pour un numéro FR :
   prévoir le **bundle réglementaire** (justificatif d'adresse, quelques jours).
3. **Google Cloud** — client OAuth « application web », redirect
   `{APP_URL}/api/oauth/google/callback`, scopes agenda + contacts (sensitive → app
   en mode test jusqu'à 100 utilisateurs, vérification Google ensuite).
4. **OpenRouteService** (openrouteservice.org) — clé gratuite (itinéraires).
5. *(Seulement si `RUNTIME=vapi`)* **Vapi** (vapi.ai) — clé API + secret webhook +
   clés fournisseur (ElevenLabs, Deepgram, Anthropic) dans *Provider Keys*.

### 2. Base de données
Dans Supabase → SQL Editor, exécuter `supabase/migrations/0001_init.sql`.

### 3. Application
```bash
cd web
cp .env.example .env.local    # remplir toutes les variables
npm install
npm run dev                   # http://localhost:3000
```
En dev, exposer les webhooks avec `ngrok http 3000` et mettre l'URL ngrok dans `APP_URL`.

### 4. Déploiement (Vercel, gratuit pour commencer)
- Importer le repo, racine = `web/`, coller les variables d'env.
- `vercel.json` programme déjà les 2 crons (rappels + appels sortants, chaque minute).
- Mettre `APP_URL` = URL de prod.

### 5. Démarrer le runtime vocal auto-hébergé
Voir [`runtime/README.md`](runtime/README.md) : un serveur EU (~10 €/mois),
`pip install`, Ollama, `uvicorn server:app`. STT/TTS/LLM tournent en local ;
le runtime appelle l'API Next (`RUNTIME_API_SECRET` partagé).
*(Alternative managée : `RUNTIME=vapi` + `POST /api/admin/setup-vapi` — voir le code.)*

### 6. 📞 Le jour où le numéro arrive (dernière étape, 5 minutes)
1. Acheter le numéro FR chez Twilio (bundle réglementaire déjà validé).
2. Webhook **Voice** du numéro → `POST https://RUNTIME/twilio/inbound`.
3. Webhook **Messaging** du numéro → `POST {APP_URL}/api/twilio/sms`.
4. `TWILIO_FROM_NUMBER` = ce numéro (web/.env + runtime/.env).
5. Appeler. C'est tout.

## Parcours utilisateur
1. Un proche crée le compte sur le site (lien magique e-mail).
2. Onboarding : identité + numéro du dumbphone (OTP SMS) → connexion Google
   (optionnelle) → consentements (registre horodaté, révocable) → code PIN à 4 chiffres.
3. La personne appelle le numéro : l'agent la reconnaît (caller-ID), la salue par
   son prénom, parle lentement (débit 0.85).
4. Actions sensibles (SMS dicté, appel sortant) : PIN parlé + confirmation orale.
5. Missions sortantes : l'agent appelle le cabinet/taxi/restaurant (DTMF, répondeur,
   3 tentatives max), puis SMS de compte-rendu. Pour le taxi, il demande que le
   chauffeur **rappelle directement le client** à son arrivée (même téléphone).

## Coûts (petit budget, §10 du doc)
- Runtime self-host : serveur EU ~10 €/mois **fixes**, STT/TTS/LLM locaux = 0 €/minute.
- Météo : Open-Meteo, **0 €, sans clé**. Itinéraires : ORS gratuit (2000/j).
- Vercel + Supabase : offres gratuites. Il ne reste que les minutes opérateur (~1-2 ct/min).
- Si `LLM_PROVIDER=mistral|anthropic` : quelques centimes par appel, qualité supérieure.

## Deux runtimes, une seule logique métier
Les skills, prompts, PIN et consentements vivent dans `web/src/lib/` et sont servis
par API (`/api/runtime/session`, `/api/tools/execute`). Le runtime vocal est
interchangeable : [Pipecat](https://github.com/pipecat-ai/pipecat) auto-hébergé
(`runtime/`, défaut) ou Vapi managé (`RUNTIME=vapi`) si on veut la meilleure latence
sans infra. [LiveKit Agents](https://github.com/livekit/agents) reste une alternative
self-host ; Vocode est à éviter (plus maintenu).

## Projets open source utilisés / inspirations
- **[Sift](https://github.com/edleeman17/sift)** (MIT) — « dumbphone companion » :
  son modèle de commandes SMS bidirectionnelles a inspiré `sms-commands.ts`.
- **Open-Meteo** (météo, gratuit), **OpenRouteService** (itinéraires, EU).
- **Pipecat / LiveKit Agents** — cible de migration self-host (phase 2).

## Reste à faire (phase 1 du doc)
- Skill **Mail** (Gmail = scopes *restricted* → vérification CASA annuelle, à budgéter).
- Microsoft 365 (Graph) en second fournisseur.
- DPAs fournisseurs + effacement bout-en-bout automatisé (la base et les consentements sont prêts).
- Bake-off voix (Vapi vs Retell), vérification par locuteur, numéro partagé multi-utilisateurs.
