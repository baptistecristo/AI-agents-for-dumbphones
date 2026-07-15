#
# Adapté de PiperHttpTTSService de Pipecat (src/pipecat/services/piper/tts.py).
#
# Copyright (c) 2024-2026, Daily
#
# SPDX-License-Identifier: BSD-2-Clause
#
# Le texte complet de la licence BSD 2-Clause figure dans le fichier NOTICE, à la
# racine du dépôt.
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

Protocole (piper-tts 1.3 à 1.4.2, https://github.com/OHF-Voice/piper1-gpl)
--------------------------------------------------------------------------
POST <PIPER_BASE_URL>/ {"text": ..., "voice": ...} -> WAV (corps binaire).

Deux pièges vérifiés dans le source de 1.4.2, invisibles à la lecture des docs :

- La synthèse est servie sur `/`, pas sur `/synthesize`. La route `/synthesize`
  n'existe que sur `master`, non publié ; c'est pourtant elle que documentent et
  `docs/API_HTTP.md` et le `PiperHttpTTSService` de Pipecat. La viser sur une
  version installable donne un 404.
- Le serveur répond en `text/html` même quand le corps est un WAV. On ne se fie
  donc pas au Content-Type : l'en-tête RIFF est reconnu à la lecture.

Une voix absente du disque ne provoque pas d'erreur : le serveur retombe sur sa
voix par défaut et renvoie 200 (cf. check_voices_available).
"""

from collections.abc import AsyncGenerator
from dataclasses import dataclass

import aiohttp
from loguru import logger
from pipecat.frames.frames import ErrorFrame, Frame, TTSStoppedFrame
from pipecat.services.settings import TTSSettings
from pipecat.services.tts_service import TTSService


class PiperVoiceMissing(RuntimeError):
    """Une voix configurée n'est pas servie par le serveur Piper."""


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
    """
    url = f"{base_url}/voices"
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            response.raise_for_status()
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
        aiohttp_session: aiohttp.ClientSession | None = None,
        settings: Settings | None = None,
        **kwargs,
    ):
        """Args:
        base_url: route de synthèse complète, p. ex. http://localhost:5000/synthesize.
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
        self._session = aiohttp_session
        self._owns_session = aiohttp_session is None

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
                self._base_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            ) as response:
                if response.status != 200:
                    detail = await response.text()
                    yield ErrorFrame(
                        error=(
                            f"Serveur Piper : HTTP {response.status} ({detail}). "
                            f"URL interrogée : {self._base_url}"
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
                    f"Serveur Piper injoignable sur {self._base_url} ({err}). "
                    "Est-il lancé ? Voir runtime/README.md."
                )
            )
            yield TTSStoppedFrame(context_id=context_id)
        finally:
            await self.stop_ttfb_metrics()
