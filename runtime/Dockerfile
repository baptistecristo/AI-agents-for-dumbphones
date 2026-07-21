# syntax=docker/dockerfile:1

# Image du runtime vocal auto-hébergé (FastAPI + Pipecat).
#
# `piper-tts` (GPL-3.0-or-later) n'entre PAS dans cette image, volontairement.
# Ce dépôt est sous Apache-2.0, et la compatibilité ne va que dans un sens :
# du code GPL ne peut pas être inclus dans un artefact Apache-2.0. Tant que
# `piper-tts` n'est qu'une ligne de documentation, rien n'est distribué ; le
# jour où on publierait une image qui le contient, les obligations de la
# GPL-3.0 s'attacheraient à cette image. Piper tourne donc dans son propre
# conteneur, construit depuis la source d'OHF-Voice (voir compose.yaml), et le
# runtime lui parle en HTTP (piper_http.py). Voir l'issue #26.
#
# La dernière étape de construction vérifie cette absence plutôt que de s'y
# fier : `pip show piper-tts` doit échouer, sinon le build échoue.

# ---------------------------------------------------------------- construction
FROM python:3.12-slim AS builder

# Un venv plutôt que les site-packages du système : il se copie d'un seul
# `COPY --from`, sans traîner pip, ses caches et les en-têtes de build.
ENV VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN python -m venv "$VIRTUAL_ENV"

WORKDIR /build
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Garde-fou de construction, pas de simple contrôle qualité : sans lui, un
# `pipecat-ai[piper]` réintroduit dans requirements.txt produirait une image
# contenant du GPL sans que personne ne le voie passer. La CI fait le même
# contrôle sur l'arbre de dépendances (.github/workflows/ci.yml) ; celui-ci
# porte sur ce qui finit réellement dans l'image.
RUN if pip show piper-tts > /dev/null 2>&1; then \
      echo "ERREUR : piper-tts (GPL-3.0-or-later) est installé dans l'image du runtime." >&2; \
      echo "Voir l'issue #26 : Piper doit rester un service séparé." >&2; \
      exit 1; \
    fi

# Inventaire des paquets sous GPL, imprimé et non bloquant.
#
# Il en reste un, et le taire serait pire que de le lister : `pyyaml-include`
# est en GPL-3.0-or-later et c'est une dépendance de BASE de pipecat-ai
# (`pyyaml-include<2,>=1.4`), pas un extra qu'on pourrait ne pas demander.
# Sortir l'extra `piper` était donc nécessaire mais ne suffit pas à rendre
# cette image publiable : la publier distribuerait quand même du code GPL.
#
# Rien n'est distribué aujourd'hui, puisque ce dépôt ne pousse aucune image
# (voir compose.yaml et la CI). C'est un problème latent, de la même famille
# que l'import Piper en processus avant l'#28, et il devra être tranché avant
# qu'une image parte vers un registre. Étape non bloquante à dessein : elle
# rend le fait visible à chaque construction sans casser un build sur un état
# connu et documenté.
RUN python - <<'PY'
import importlib.metadata as md

trouves = []
for dist in md.distributions():
    meta = dist.metadata
    licence = (meta.get("License") or "").upper()
    classifiers = meta.get_all("Classifier") or []
    gpl_classifier = any(
        "General Public License" in c and "Lesser" not in c for c in classifiers
    )
    if gpl_classifier or ("GPL" in licence and "LGPL" not in licence):
        trouves.append(f"{meta.get('Name')} {meta.get('Version')}")

print("--- Inventaire GPL de l'image du runtime ---")
for ligne in sorted(trouves) or ["aucun"]:
    print(f"  {ligne}")
print("Voir l'issue #26 avant de pousser cette image vers un registre.")
PY

# ---------------------------------------------------------------- exécution
FROM python:3.12-slim

# tini comme PID 1 : uvicorn reçoit alors vraiment SIGTERM (arrêt propre des
# appels en cours) et les processus fils de Pipecat ne restent pas zombies.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

ENV VIRTUAL_ENV=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # faster-whisper télécharge son modèle au premier appel (~1,5 Go pour
    # `medium`). Sans point de montage dédié, ce téléchargement recommence à
    # chaque recréation du conteneur : compose.yaml y branche un volume.
    HF_HOME=/home/runtime/.cache/huggingface

# Utilisateur non root, sans mot de passe ni shell de connexion. UID fixe :
# un volume écrit par le conteneur garde le même propriétaire d'une
# reconstruction à l'autre.
RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin runtime

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
COPY --chown=runtime:runtime . /app

RUN mkdir -p "$HF_HOME" && chown -R runtime:runtime /home/runtime

USER runtime

EXPOSE 8000

# `/health` ne demande aucune authentification et ne joint aucun service
# externe : il dit que ce processus-ci répond, pas que Piper va bien. Requête
# en Python plutôt qu'avec curl, absent de l'image slim et qu'il faudrait
# installer pour ça seul.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
