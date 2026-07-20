#
# Adapté de PiperHttpTTSService de Pipecat (src/pipecat/services/piper/tts.py).
#
# Copyright (c) 2024-2026, Daily
#
# SPDX-License-Identifier: BSD-2-Clause
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions are met:
#
# 1. Redistributions of source code must retain the above copyright notice, this
#    list of conditions and the following disclaimer.
#
# 2. Redistributions in binary form must reproduce the above copyright notice,
#    this list of conditions and the following disclaimer in the documentation
#    and/or other materials provided with the distribution.
#
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
# AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
# IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
# DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
# FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
# DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
# SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
# CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
# OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
# OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
#
# Le même texte figure dans le fichier NOTICE, à la racine du dépôt.
#
"""Client TTS Piper en HTTP, sans le paquet `piper-tts`.

Pourquoi cette copie plutôt qu'un import
----------------------------------------
`pipecat.services.piper.tts` importe `piper` au niveau du module :

    from piper import PiperVoice
    from piper.download_voices import download_voice

et relève l'ImportError si le paquet manque. Les DEUX classes du module en
dépendent donc, y compris la variante HTTP — importer `PiperHttpTTSService`
depuis Pipecat charge `piper-tts` (GPL-3.0-or-later) dans ce processus alors
même que la synthèse tourne dans un autre. L'extra `pipecat-ai[piper]` en fait
par ailleurs une dépendance dure.

Ce fichier ne touche aucun symbole de `piper` : il parle le protocole HTTP
documenté du serveur Piper (POST JSON -> WAV) avec aiohttp seul. `piper-tts`
n'est plus installé par requirements.txt ; le serveur Piper est un processus
séparé que l'opérateur lance lui-même (voir README).

Ce que cela change, factuellement : `piper-tts` ne fait plus partie de l'arbre
de dépendances du runtime et aucun code GPL n'est importé ici. La question de
licence elle-même reste ouverte — voir l'issue #26.

Protocole, et pourquoi la route se détecte
------------------------------------------
https://github.com/OHF-Voice/piper1-gpl : la route de synthèse a bougé entre
deux versions installables, vérifié dans le source de chaque tag.

- 1.3 à 1.4.2   : `@app.route("/", methods=["POST"])`, pas de `/synthesize`.
- 1.5.0 et plus : `@app.route("/synthesize", methods=["POST"])`, et `/` devient
  une page HTML de test en `methods=["GET"]`.

1.5.0 est parue le 17/07/2026. Comme Pipecat épingle `piper-tts>=1.3.0,<2`, un
`pip install "piper-tts[http]"` fait aujourd'hui tomber sur 1.5.0 : viser `/` en
dur y donne un **405**, viser `/synthesize` en dur donne un **404** sur 1.4.2.
D'où PIPER_SYNTHESIZE_PATH et la détection par OPTIONS (voir
detect_synthesize_path) : le défaut vise la version courante, la 1.4.2 continue
de marcher, et un décalage de route se voit AU DÉMARRAGE plutôt qu'au premier
appel.

Le corps de la requête, lui, n'a pas changé entre 1.4.2 et 1.5.0 : mêmes champs
JSON, même WAV en retour. Seule la route bouge.

Deux pièges vérifiés dans le source, invisibles à la lecture des docs :

- Le serveur répond en `text/html` même quand le corps est un WAV. On ne se fie
  donc pas au Content-Type : l'en-tête RIFF est reconnu à la lecture.
- Une voix absente du disque ne provoque pas d'erreur : le serveur journalise un
  WARNING, retombe sur sa voix par défaut et renvoie 200 (cf.
  check_voices_available). `/voices` est identique dans les deux versions.
"""

from collections.abc import AsyncGenerator
from dataclasses import dataclass

import aiohttp
from loguru import logger
from pipecat.frames.frames import ErrorFrame, Frame, TTSStoppedFrame
from pipecat.services.settings import TTSSettings
from pipecat.services.tts_service import TTSService

# Route de synthèse selon la version du serveur Piper. Le défaut vise la version
# courante : c'est elle qu'installe `pip install "piper-tts[http]"` aujourd'hui.
SYNTHESIZE_PATH_CURRENT = "/synthesize"  # piper-tts >= 1.5.0
SYNTHESIZE_PATH_LEGACY = "/"  # piper-tts 1.3 - 1.4.2
KNOWN_SYNTHESIZE_PATHS = (SYNTHESIZE_PATH_CURRENT, SYNTHESIZE_PATH_LEGACY)

# Valeur de PIPER_SYNTHESIZE_PATH qui demande la détection au démarrage.
SYNTHESIZE_PATH_AUTO = "auto"


class PiperMisconfigured(RuntimeError):
    """Le serveur Piper répond, mais pas ce qu'on attend : erreur de configuration.

    Distincte d'une panne réseau à dessein. Si le serveur a répondu quoi que ce
    soit, il tourne : le tort est de notre côté (mauvaise URL, mauvaise route,
    voix absente) et aucune attente ne le corrigera. server.py refuse donc de
    démarrer sur cette famille d'erreurs, là où « injoignable » n'est qu'un
    avertissement.
    """


class PiperVoiceMissing(PiperMisconfigured):
    """Une voix configurée n'est pas servie par le serveur Piper."""


class PiperRouteMismatch(PiperMisconfigured):
    """La route de synthèse configurée n'accepte pas POST sur ce serveur."""


class PiperEndpointNotFound(PiperMisconfigured):
    """PIPER_BASE_URL ne pointe pas sur la racine d'un serveur Piper."""


def _allowed_methods(response: aiohttp.ClientResponse) -> set[str]:
    """Méthodes annoncées par l'en-tête `Allow` d'une réponse OPTIONS."""
    raw = response.headers.get("Allow", "")
    return {method.strip().upper() for method in raw.split(",") if method.strip()}


async def _route_accepts_post(session: aiohttp.ClientSession, url: str) -> bool | None:
    """La route `url` accepte-t-elle POST ? True / False / None si indécidable.

    Sonder par OPTIONS plutôt que par un vrai POST : un POST de contrôle
    coûterait une synthèse complète à chaque démarrage. Flask ajoute OPTIONS
    d'office à toute route et rend 200 avec l'en-tête `Allow`, ce qui donne la
    forme du serveur sans rien synthétiser.

    C'est `Allow` qui décide, quel que soit le code de retour : Flask le renvoie
    sur un 200, d'autres serveurs (et aiohttp, donc le faux serveur des tests) le
    renvoient sur un 405. Les deux disent la même chose, autant lire les deux.

    None (indécidable) est un cas distinct de False : un reverse proxy peut
    avaler OPTIONS ou manger l'en-tête `Allow`. On ne veut pas refuser de
    démarrer sur cette base, seulement sur une réponse qui dit clairement non.
    """
    async with session.options(url, allow_redirects=False) as response:
        if response.status == 404:
            return False  # la route n'existe pas sur cette version
        allowed = _allowed_methods(response)
        if allowed:
            return "POST" in allowed
        return None  # pas d'en-tête `Allow` exploitable : on ne conclut pas


async def detect_synthesize_path(base_url: str, session: aiohttp.ClientSession) -> str:
    """Trouve la route de synthèse du serveur, ou lève PiperRouteMismatch.

    Sonde `/synthesize` (1.5.0+) puis `/` (1.4.2 et avant). La première qui
    accepte POST gagne. Si aucune ne répond clairement (proxy exotique), on
    retombe sur le défaut de la version courante en le disant, plutôt que de
    bloquer un déploiement qui marche peut-être très bien.
    """
    for path in KNOWN_SYNTHESIZE_PATHS:
        accepts = await _route_accepts_post(session, f"{base_url}{path}")
        if accepts:
            logger.info(f"Serveur Piper : synthèse détectée sur POST {path}")
            return path
        if accepts is None:
            logger.warning(
                f"Serveur Piper : {base_url}{path} ne permet pas de conclure "
                f"(OPTIONS sans en-tête Allow exploitable). Détection abandonnée, "
                f"on garde {SYNTHESIZE_PATH_CURRENT}. Épinglez PIPER_SYNTHESIZE_PATH "
                f"si ce n'est pas la bonne."
            )
            return SYNTHESIZE_PATH_CURRENT

    raise PiperRouteMismatch(
        f"Aucune route de synthèse sur {base_url} : ni POST {SYNTHESIZE_PATH_CURRENT} "
        f"(piper-tts >= 1.5.0) ni POST {SYNTHESIZE_PATH_LEGACY} (1.3 - 1.4.2) "
        "n'est acceptée. PIPER_BASE_URL pointe-t-elle bien sur la racine d'un "
        "serveur `python -m piper.http_server` ? (L'image linuxserver/piper parle "
        "le protocole Wyoming, pas cette API : voir runtime/README.md.)"
    )


async def verify_synthesize_path(base_url: str, path: str, session: aiohttp.ClientSession) -> None:
    """Vérifie qu'une route de synthèse épinglée accepte bien POST.

    Sans ce contrôle, PIPER_SYNTHESIZE_PATH mal réglé ne se verrait qu'à
    l'appel : le serveur renverrait 405 (route connue, mauvaise méthode) ou 404,
    une fois l'appelant déjà en ligne.
    """
    accepts = await _route_accepts_post(session, f"{base_url}{path}")
    if accepts is False:
        other = (
            SYNTHESIZE_PATH_LEGACY if path == SYNTHESIZE_PATH_CURRENT else SYNTHESIZE_PATH_CURRENT
        )
        raise PiperRouteMismatch(
            f"Le serveur Piper de {base_url} n'accepte pas POST {path}. "
            f"La route de synthèse a changé en 1.5.0 : `/synthesize` à partir de "
            f"1.5.0, `/` de 1.3 à 1.4.2. Essayez PIPER_SYNTHESIZE_PATH={other}, "
            f"ou PIPER_SYNTHESIZE_PATH=auto pour laisser le runtime détecter."
        )
    if accepts is None:
        logger.warning(
            f"Serveur Piper : impossible de confirmer POST {path} sur {base_url} "
            "(OPTIONS inexploitable). Route gardée telle quelle."
        )


async def check_voices_available(base_url: str, voices: list[str]) -> None:
    """Vérifie que le serveur Piper sert bien `voices`, ou lève PiperVoiceMissing.

    Indispensable, parce que l'échec est silencieux sans elle. Le serveur charge
    la voix demandée depuis son --data-dir ; s'il ne la trouve pas, il ne renvoie
    pas d'erreur : il journalise un WARNING, retombe sur la voix de `-m` et
    répond 200. Un appel en anglais sortirait donc dans la voix française, avec
    le phonémiseur français — audible, mais seulement par l'appelant.

    GET /voices rend un objet dont les clés sont les identifiants de voix, sans
    le suffixe .onnx. Ne pas y trouver une voix est une erreur de configuration
    qui corrompt tous les appels dans cette langue : autant la voir au démarrage.

    Une réponse HTTP non-200 devient PiperEndpointNotFound, pas une erreur
    réseau : le serveur a répondu, donc il tourne, donc c'est PIPER_BASE_URL qui
    est fausse. La nuance compte, server.py ne tolérant que l'injoignable.
    """
    url = f"{base_url}/voices"
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            if response.status != 200:
                raise PiperEndpointNotFound(
                    f"GET {url} a répondu HTTP {response.status}. PIPER_BASE_URL doit "
                    f"être la RACINE du serveur Piper (http://localhost:5000), pas une "
                    f"route de synthèse : `/voices` s'en déduit. Reçu : {base_url!r}."
                )
            served = await response.json(content_type=None)

    missing = [voice for voice in voices if voice not in served]
    if missing:
        raise PiperVoiceMissing(
            f"Le serveur Piper de {base_url} ne sert pas {', '.join(missing)}. "
            f"Voix disponibles : {', '.join(sorted(served)) or 'aucune'}. "
            "Placez le .onnx et son .onnx.json dans le --data-dir du serveur "
            "(ou POST /download). Sans cela, les appels dans cette langue "
            "sortiraient dans la voix par défaut, sans erreur."
        )


async def check_piper_server(base_url: str, voices: list[str], synthesize_path: str) -> str:
    """Contrôle de démarrage complet. Rend la route de synthèse à utiliser.

    Deux pannes silencieuses à attraper avant le premier appel, pas pendant :
      - une voix absente -> le serveur répond 200 dans la mauvaise voix ;
      - une route fausse -> le serveur répond 405 (ou 404) à CHAQUE synthèse,
        alors que GET /voices, lui, existe dans toutes les versions et laisserait
        donc passer un runtime incapable de parler.

    `synthesize_path` vaut "auto" (détection) ou une route explicite (vérifiée).
    """
    await check_voices_available(base_url, voices)

    async with aiohttp.ClientSession() as session:
        if synthesize_path == SYNTHESIZE_PATH_AUTO:
            return await detect_synthesize_path(base_url, session)
        await verify_synthesize_path(base_url, synthesize_path, session)
        return synthesize_path


@dataclass
class PiperHttpTTSSettings(TTSSettings):
    """Réglages du service. Seul `voice` est lu ; il nomme le modèle Piper."""

    pass


class PiperHttpTTSService(TTSService):
    """Synthèse Piper via son serveur HTTP, sans dépendance au paquet `piper`."""

    Settings = PiperHttpTTSSettings
    _settings: Settings

    def __init__(
        self,
        *,
        base_url: str,
        synthesize_path: str = SYNTHESIZE_PATH_CURRENT,
        aiohttp_session: aiohttp.ClientSession | None = None,
        settings: Settings | None = None,
        **kwargs,
    ):
        """Args:
        base_url: RACINE du serveur Piper, sans route ni barre finale, p. ex.
            http://localhost:5000. La route de synthèse s'y ajoute
            (`synthesize_path`) et `/voices` s'en déduit : mettre la route de
            synthèse ici casserait les deux.
        synthesize_path: route de synthèse, concaténée derrière `base_url` :
            `/synthesize` pour piper-tts >= 1.5.0 (défaut), `/` pour 1.3 à 1.4.2.
            server.py la résout au démarrage (PIPER_SYNTHESIZE_PATH=auto) et
            vérifie qu'elle accepte POST.
        aiohttp_session: session HTTP à réutiliser. Omise, le service en ouvre une
            à la première synthèse et la ferme dans cleanup() ; fournie, elle
            appartient à l'appelant, qui la ferme.
        settings: réglages Pipecat ; `voice` = nom du modèle Piper.
        """
        default_settings = self.Settings(model=None, voice=None, language=None)
        if settings is not None:
            default_settings.apply_update(settings)

        super().__init__(
            push_start_frame=True,
            push_stop_frames=True,
            settings=default_settings,
            **kwargs,
        )

        self._base_url = base_url
        # "auto" est une consigne de détection, pas une route : la concaténer
        # donnerait `http://hôte:5000auto`. server.py l'a normalement déjà
        # résolue, mais un appelant qui instancie le service sans passer par le
        # démarrage du serveur (test, script) ne l'a pas fait.
        if synthesize_path == SYNTHESIZE_PATH_AUTO:
            synthesize_path = SYNTHESIZE_PATH_CURRENT
        self._synthesize_path = synthesize_path
        self._session = aiohttp_session
        self._owns_session = aiohttp_session is None

    @property
    def synthesize_url(self) -> str:
        """URL complète de synthèse : racine + route."""
        return f"{self._base_url}{self._synthesize_path}"

    def can_generate_metrics(self) -> bool:
        return True

    def _get_session(self) -> aiohttp.ClientSession:
        """Session HTTP, ouverte au premier besoin.

        Paresseux à dessein : un appel qui échoue avant la première synthèse ne
        doit pas laisser derrière lui une session jamais fermée.
        """
        if self._session is None:
            self._session = aiohttp.ClientSession()
        return self._session

    async def cleanup(self) -> None:
        """Ferme la session si le service l'a ouverte (Pipeline.cleanup l'appelle)."""
        await super().cleanup()
        if self._owns_session and self._session is not None:
            await self._session.close()
            self._session = None

    async def run_tts(self, text: str, context_id: str) -> AsyncGenerator[Frame, None]:
        """Synthétise `text` et émet les trames audio correspondantes."""
        logger.debug(f"{self}: synthèse [{text}]")

        try:
            await self.start_ttfb_metrics()
            payload = {"text": text, "voice": self._settings.voice}

            async with self._get_session().post(
                self.synthesize_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            ) as response:
                if response.status != 200:
                    detail = await response.text()
                    hint = ""
                    if response.status in (404, 405):
                        # La panne exacte que le contrôle de démarrage attrape :
                        # la nommer ici aussi, au cas où il aurait été sauté.
                        hint = (
                            " La route de synthèse a changé en piper-tts 1.5.0 "
                            "(`/synthesize`, contre `/` de 1.3 à 1.4.2) : voir "
                            "PIPER_SYNTHESIZE_PATH."
                        )
                    yield ErrorFrame(
                        error=(
                            f"Serveur Piper : HTTP {response.status} ({detail}). "
                            f"URL interrogée : {self.synthesize_url}.{hint}"
                        )
                    )
                    yield TTSStoppedFrame(context_id=context_id)
                    return

                await self.start_tts_usage_metrics(text)

                # Le serveur renvoie un WAV complet : strip_wav_header lit la
                # fréquence dans l'en-tête RIFF et rééchantillonne vers
                # self.sample_rate. Ne pas passer in_sample_rate : Piper la fixe
                # d'après la voix chargée, pas nous.
                async for frame in self._stream_audio_frames_from_iterator(
                    response.content.iter_chunked(self.chunk_size),
                    strip_wav_header=True,
                    context_id=context_id,
                ):
                    await self.stop_ttfb_metrics()
                    yield frame
        except aiohttp.ClientError as err:
            yield ErrorFrame(
                error=(
                    f"Serveur Piper injoignable sur {self.synthesize_url} ({err}). "
                    "Est-il lancé ? Voir runtime/README.md."
                )
            )
            yield TTSStoppedFrame(context_id=context_id)
        finally:
            await self.stop_ttfb_metrics()
