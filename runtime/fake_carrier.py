"""Le faux opérateur : appelle l'agent sans numéro, sans Twilio, sans carte SIM.

Joue le rôle de Twilio au bout du websocket média : ouvre /ws avec le jeton
signé, envoie l'audio de l'« appelant » en trames µ-law de 20 ms cadencées
temps réel (silence compris, comme une vraie ligne), enregistre ce que l'agent
répond, et enchaîne les répliques quand l'agent a fini de parler. Le serveur
ne voit pas la différence avec un vrai appel — c'est le même endpoint, le même
protocole, la même authentification.

Les questions se donnent en texte (--ask "Quel temps fait-il à Lyon ?",
synthétisées par le serveur Piper déjà lancé pour le TTS de l'agent) ou en
fichier WAV (--ask question.wav, votre voix). À la fin : un WAV stéréo
appelant/agent, comme un enregistrement « dual channel » d'opérateur.

Usage type, depuis le conteneur du runtime (voir runtime/README.md) :

    docker compose exec runtime python fake_carrier.py \
        --ask "Quelle heure est-il à Tokyo ?" \
        --ask "Et quel temps fait-il à Lyon ?"

Hors conteneur, il faut Python >= 3.11 avec `websockets` et `httpx`, et
RUNTIME_API_SECRET dans l'environnement (ou runtime/.env).
"""

import argparse
import asyncio
import json
import os
import sys
import time
import uuid
from collections import deque
from pathlib import Path

import httpx
import websockets

import twilio_media as tm

try:  # runtime/.env si présent — le CLI reste utilisable sans python-dotenv
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

# Mêmes défauts que config.py, sans l'importer : config tire pipecat (lourd) et
# ce CLI doit rester lançable hors du conteneur avec deux paquets pip.
_VOICES = {
    "fr": os.getenv("PIPER_VOICE_FR", os.getenv("PIPER_VOICE") or "fr_FR-siwis-medium"),
    "en": os.getenv("PIPER_VOICE_EN", "en_US-lessac-medium"),
    "es": os.getenv("PIPER_VOICE_ES", "es_ES-davefx-medium"),
}

_FRAME_S = tm.FRAME_MS / 1000


def _log(started: float, message: str) -> None:
    print(f"[{time.monotonic() - started:6.1f}s] {message}", flush=True)


def synthesize_question(text: str, voice: str, base_url: str, path_hint: str, rate: float) -> bytes:
    """Fait dire `text` au serveur Piper et rend l'audio en µ-law 8 kHz.

    La route de synthèse dépend de la version de piper-tts (voir piper_http.py) :
    si elle n'est pas épinglée, on tente `/synthesize` (>= 1.5.0) puis `/`.
    `rate` est le length_scale de Piper : > 1 ralentit. Une question posée un
    peu lentement transcrit nettement mieux à travers le codec téléphonique.
    """
    paths = [path_hint] if path_hint and path_hint != "auto" else ["/synthesize", "/"]
    last = None
    for path in paths:
        response = httpx.post(
            f"{base_url}{path}",
            json={"text": text, "voice": voice, "length_scale": rate},
            timeout=120,
        )
        if response.status_code in (404, 405):
            last = response
            continue
        response.raise_for_status()
        return tm.wav_to_ulaw(response.content)
    raise RuntimeError(
        f"Aucune route de synthèse sur {base_url} (dernier essai : HTTP "
        f"{last.status_code if last else '?'}). Le serveur Piper tourne-t-il ? "
        "Voir runtime/README.md."
    )


# Silence autour de chaque réplique. En tête : le VAD déclenche ~200 ms APRÈS le
# début de la parole et repêche ce qui précède dans son tampon — si la réplique
# commence pile sur le premier phonème, ce tampon contient la fin d'une autre
# trame et le début du mot se perd (« Quel temps » entendu « Qu'est-ce qu'en »).
# En queue : l'analyseur de fin de tour veut du silence franc pour conclure.
_LEAD_SILENCE = bytes([tm.SILENCE_BYTE]) * (tm.SAMPLE_RATE * 500 // 1000)
_TAIL_SILENCE = bytes([tm.SILENCE_BYTE]) * (tm.SAMPLE_RATE * 400 // 1000)


def build_utterances(asks: list[str], lang: str, piper_url: str, piper_path: str, rate: float) -> list[bytes]:
    """Chaque --ask devient de l'audio : WAV lu tel quel, texte synthétisé."""
    utterances = []
    for ask in asks:
        if ask.lower().endswith(".wav") and Path(ask).exists():
            audio = tm.load_wav_as_ulaw(ask)
        else:
            audio = synthesize_question(ask, _VOICES[lang], piper_url, piper_path, rate)
        utterances.append(_LEAD_SILENCE + audio + _TAIL_SILENCE)
    return utterances


class Call:
    """État partagé d'un appel simulé : horloge d'émission, pistes, activité agent."""

    def __init__(self) -> None:
        self.outbox: deque[bytes] = deque()
        self.caller_track = bytearray()
        self.agent_track = bytearray()
        self.sent_frames = 0
        self.received_bytes = 0  # audio agent réellement reçu (sans les silences)
        self.last_agent_audio = 0.0  # temps monotone du dernier « media » reçu
        self.cleared = 0  # événements « clear » (interruptions) reçus
        self.closed = asyncio.Event()

    @property
    def elapsed_bytes(self) -> int:
        return self.sent_frames * tm.FRAME_BYTES


async def _sender(ws, call: Call, stream_sid: str) -> None:
    """Cadence la ligne : une trame toutes les 20 ms, silence quand rien à dire."""
    loop = asyncio.get_running_loop()
    next_tick = loop.time()
    while not call.closed.is_set():
        frame = call.outbox.popleft() if call.outbox else tm.SILENCE_FRAME
        try:
            await ws.send(tm.dumps(tm.media_event(stream_sid, frame)))
        except websockets.ConnectionClosed:
            call.closed.set()
            return
        call.caller_track.extend(frame)
        call.sent_frames += 1
        next_tick += _FRAME_S
        await asyncio.sleep(max(0.0, next_tick - loop.time()))


async def _receiver(ws, call: Call, started: float) -> None:
    """Range l'audio de l'agent sur la même horloge que l'émission."""
    loop = asyncio.get_running_loop()
    try:
        async for raw in ws:
            message = json.loads(raw)
            audio = tm.media_payload(message)
            if audio is not None:
                # Caler le début de la parole sur l'horloge d'émission, pour que
                # le WAV stéréo reste synchrone. Au fil d'une même réplique, on
                # colle les paquets bout à bout.
                position = call.elapsed_bytes
                if len(call.agent_track) < position - tm.FRAME_BYTES:
                    call.agent_track.extend(
                        bytes([tm.SILENCE_BYTE]) * (position - len(call.agent_track))
                    )
                call.agent_track.extend(audio)
                call.received_bytes += len(audio)
                call.last_agent_audio = loop.time()
            elif message.get("event") == "clear":
                call.cleared += 1
                _log(started, "← clear (interruption : l'agent efface son tampon)")
    except websockets.ConnectionClosed:
        pass
    finally:
        call.closed.set()


async def _wait_agent_done(
    call: Call, started: float, gap: float, timeout: float, label: str
) -> bool:
    """Attend que l'agent ait parlé (au moins ~0,3 s) puis se soit tu `gap` secondes."""
    loop = asyncio.get_running_loop()
    baseline = len(call.agent_track)
    deadline = loop.time() + timeout
    spoken = False
    while loop.time() < deadline and not call.closed.is_set():
        if not spoken and len(call.agent_track) - baseline >= 0.3 * tm.SAMPLE_RATE:
            spoken = True
            _log(started, f"← l'agent parle ({label})")
        if spoken and loop.time() - call.last_agent_audio >= gap:
            _log(started, f"← l'agent a fini ({label})")
            return True
        await asyncio.sleep(0.05)
    if call.closed.is_set() and spoken:
        return True  # l'agent a parlé puis raccroché : une fin, pas un échec
    _log(started, f"⚠ délai dépassé en attendant l'agent ({label})")
    return False


async def run_call(args, utterances: list[bytes]) -> int:
    secret = args.secret or os.getenv("RUNTIME_API_SECRET", "")
    if not secret:
        print("RUNTIME_API_SECRET manquant (argument --secret ou environnement).")
        return 2

    stream_sid = f"MZfake{uuid.uuid4().hex[:24]}"
    call_sid = f"demo-{uuid.uuid4()}"
    # --lang choisit à la fois la voix des questions synthétisées ET la langue
    # de session (prompt, Whisper, voix de l'agent), comme sur la console /demo.
    custom = tm.signed_parameters(
        secret, caller=args.caller, demo_name=args.name, demo_lang=args.lang
    )

    started = time.monotonic()
    call = Call()
    _log(started, f"→ connexion {args.server} (call {call_sid})")

    async with websockets.connect(args.server, max_size=2**22) as ws:
        await ws.send(tm.dumps(tm.connected_event()))
        await ws.send(tm.dumps(tm.start_event(stream_sid, call_sid, custom)))

        sender = asyncio.create_task(_sender(ws, call, stream_sid))
        receiver = asyncio.create_task(_receiver(ws, call, started))
        ok = True
        try:
            async with asyncio.timeout(args.max_duration):
                # Entrant : l'agent parle en premier (message d'accueil).
                ok = await _wait_agent_done(call, started, args.gap, args.turn_timeout, "accueil")
                for i, utterance in enumerate(utterances, start=1):
                    if not ok or call.closed.is_set():
                        break
                    seconds = len(utterance) / tm.SAMPLE_RATE
                    _log(started, f"→ l'appelant parle ({i}/{len(utterances)}, {seconds:.1f} s)")
                    call.outbox.extend(tm.iter_frames(utterance))
                    while call.outbox and not call.closed.is_set():
                        await asyncio.sleep(0.05)
                    ok = await _wait_agent_done(
                        call, started, args.gap, args.turn_timeout, f"réponse {i}"
                    )
                if not call.closed.is_set():
                    _log(started, "→ raccrochage (stop)")
                    await ws.send(tm.dumps(tm.stop_event(stream_sid)))
        except TimeoutError:
            _log(started, f"⚠ appel interrompu après --max-duration={args.max_duration}s")
            ok = False
        finally:
            call.closed.set()
            sender.cancel()
            receiver.cancel()
            await asyncio.gather(sender, receiver, return_exceptions=True)

    out_dir = Path(args.out) / time.strftime("appel-%Y%m%d-%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)
    tm.save_stereo_wav(str(out_dir / "mixte.wav"), bytes(call.caller_track), bytes(call.agent_track))
    tm.save_ulaw_as_wav(str(out_dir / "agent.wav"), bytes(call.agent_track))
    tm.save_ulaw_as_wav(str(out_dir / "appelant.wav"), bytes(call.caller_track))

    agent_seconds = call.received_bytes / tm.SAMPLE_RATE
    _log(started, f"◼ terminé : {agent_seconds:.1f} s de parole agent, "
                  f"{call.cleared} interruption(s), enregistrements dans {out_dir}")
    return 0 if ok and agent_seconds > 0 else 1


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Appelle l'agent auto-hébergé sans opérateur (faux media stream Twilio)."
    )
    parser.add_argument(
        "--ask",
        action="append",
        default=[],
        metavar="TEXTE|FICHIER.wav",
        help="une réplique de l'appelant : du texte (synthétisé par le serveur Piper) "
        "ou un fichier WAV 16 bits ; répétable, posées dans l'ordre",
    )
    parser.add_argument("--server", default="ws://localhost:8000/ws", help="websocket média du runtime")
    parser.add_argument("--caller", default="", help="numéro présenté (vide = appelant inconnu)")
    parser.add_argument("--name", default="", help="prénom auto-déclaré : l'agent salue par ce prénom")
    parser.add_argument("--lang", choices=("fr", "en", "es"), default="fr", help="voix des --ask texte")
    parser.add_argument("--secret", default="", help="RUNTIME_API_SECRET (défaut : environnement)")
    parser.add_argument(
        "--piper-url",
        default=os.getenv("PIPER_BASE_URL", "http://localhost:5000"),
        help="racine du serveur Piper pour synthétiser les --ask texte",
    )
    parser.add_argument(
        "--piper-path",
        default=os.getenv("PIPER_SYNTHESIZE_PATH", "auto"),
        help="route de synthèse Piper (auto | /synthesize | /)",
    )
    parser.add_argument("--out", default="calls", help="dossier des enregistrements")
    # 4 s par défaut, et non le 1,2 s d'un tour de parole humain : quand l'agent
    # annonce « je vérifie » puis appelle un outil, le silence qui suit n'est pas
    # une fin de tour, c'est l'outil (et parfois le LLM sur CPU) qui travaille.
    # Un gap court coupe la parole en deux et vole la vraie réponse.
    parser.add_argument("--gap", type=float, default=4.0, help="silence (s) qui clôt un tour agent")
    parser.add_argument(
        "--speech-rate",
        type=float,
        default=1.15,
        help="length_scale Piper des --ask texte (> 1 = plus lent, mieux transcrit)",
    )
    parser.add_argument("--turn-timeout", type=float, default=240, help="attente max (s) par tour")
    parser.add_argument("--max-duration", type=float, default=900, help="durée max (s) de l'appel")
    args = parser.parse_args()

    if not args.ask:
        parser.error("au moins un --ask (texte ou fichier WAV)")

    utterances = build_utterances(
        args.ask, args.lang, args.piper_url, args.piper_path, args.speech_rate
    )
    return asyncio.run(run_call(args, utterances))


if __name__ == "__main__":
    sys.exit(main())
