"""Le protocole « media stream » de Twilio, côté appelant — pour jouer l'opérateur.

Une vraie ligne arrive par l'opérateur : Twilio ouvre wss://HOTE/ws et y parle
son protocole (événements JSON, audio µ-law 8 kHz en base64, trames de 20 ms).
Ce module implémente ce protocole DEPUIS L'AUTRE BOUT, celui que le dépôt ne
possède pas : il fabrique les événements connected/start/media qu'enverrait
Twilio et décode ceux que le runtime renvoie. C'est ce qui permet à
fake_carrier.py et à la console navigateur (/demo) d'appeler l'agent sans
opérateur ni numéro : le serveur, lui, ne voit pas la différence.

Volontairement sans dépendance : stdlib seulement, pas de pipecat. Le codec
G.711 µ-law tient en deux tables ; le rééchantillonnage est une interpolation
linéaire, largement suffisante pour de la voix qui finit en 8 kHz de toute
façon. La CI vérifie que le jeton de flux calculé ici reste identique à celui
de server.py (test_twilio_media.py).
"""

import base64
import hashlib
import hmac
import io
import json
import wave

# Trame « media » Twilio : 20 ms de µ-law à 8 kHz = 160 octets, un octet par
# échantillon. 0xFF est le zéro µ-law : une trame de 0xFF est du silence.
SAMPLE_RATE = 8000
FRAME_MS = 20
FRAME_BYTES = SAMPLE_RATE * FRAME_MS // 1000  # 160
SILENCE_BYTE = 0xFF
SILENCE_FRAME = bytes([SILENCE_BYTE]) * FRAME_BYTES

# ------------------------------------------------------------------ G.711 µ-law
_BIAS = 0x84
_CLIP = 32635


def _encode_one(sample: int) -> int:
    sign = 0x80 if sample < 0 else 0
    magnitude = min(-sample if sample < 0 else sample, _CLIP) + _BIAS
    exponent = 7
    mask = 0x4000
    while exponent > 0 and not magnitude & mask:
        exponent -= 1
        mask >>= 1
    mantissa = (magnitude >> (exponent + 3)) & 0x0F
    return ~(sign | (exponent << 4) | mantissa) & 0xFF


def _decode_one(byte: int) -> int:
    byte = ~byte & 0xFF
    exponent = (byte >> 4) & 0x07
    magnitude = (((byte & 0x0F) << 3) + _BIAS << exponent) - _BIAS
    return -magnitude if byte & 0x80 else magnitude


_ENCODE = bytes(_encode_one(s) for s in range(-32768, 32768))
_DECODE = [_decode_one(b) for b in range(256)]


def pcm16_to_ulaw(pcm: bytes) -> bytes:
    """PCM 16 bits little-endian mono -> µ-law, un octet par échantillon."""
    samples = memoryview(pcm).cast("h")
    return bytes(_ENCODE[s + 32768] for s in samples)


def ulaw_to_pcm16(ulaw: bytes) -> bytes:
    """µ-law -> PCM 16 bits little-endian mono."""
    out = bytearray(len(ulaw) * 2)
    view = memoryview(out).cast("h")
    for i, b in enumerate(ulaw):
        view[i] = _DECODE[b]
    return bytes(out)


def resample_pcm16(pcm: bytes, src_rate: int, dst_rate: int) -> bytes:
    """Rééchantillonnage par interpolation linéaire (mono, 16 bits).

    Assez bon pour de la voix destinée au 8 kHz téléphonique ; un filtre
    anti-repliement n'apporterait rien d'audible après ce goulot-là.
    """
    if src_rate == dst_rate or not pcm:
        return pcm
    src = memoryview(pcm).cast("h")
    count = max(1, round(len(src) * dst_rate / src_rate))
    out = bytearray(count * 2)
    view = memoryview(out).cast("h")
    step = (len(src) - 1) / max(1, count - 1) if count > 1 else 0.0
    for i in range(count):
        pos = i * step
        left = int(pos)
        right = min(left + 1, len(src) - 1)
        frac = pos - left
        view[i] = int(src[left] * (1 - frac) + src[right] * frac)
    return bytes(out)


# ------------------------------------------------------------------ WAV <-> µ-law
def wav_to_ulaw(data: bytes) -> bytes:
    """Un fichier WAV (16 bits, mono ou stéréo, n'importe quelle fréquence)
    -> µ-law 8 kHz prêt à trancher en trames."""
    with wave.open(io.BytesIO(data), "rb") as wav:
        channels = wav.getnchannels()
        width = wav.getsampwidth()
        rate = wav.getframerate()
        frames = wav.readframes(wav.getnframes())
    if width != 2:
        raise ValueError(f"WAV 16 bits attendu (reçu : {width * 8} bits)")
    if channels == 2:
        stereo = memoryview(frames).cast("h")
        mono = bytearray(len(stereo))  # moitié d'échantillons, 2 octets chacun
        view = memoryview(mono).cast("h")
        for i in range(len(stereo) // 2):
            view[i] = (stereo[2 * i] + stereo[2 * i + 1]) // 2
        frames = bytes(mono)
    elif channels != 1:
        raise ValueError(f"WAV mono ou stéréo attendu (reçu : {channels} canaux)")
    return pcm16_to_ulaw(resample_pcm16(frames, rate, SAMPLE_RATE))


def load_wav_as_ulaw(path: str) -> bytes:
    with open(path, "rb") as f:
        return wav_to_ulaw(f.read())


def save_ulaw_as_wav(path: str, ulaw: bytes) -> None:
    """µ-law 8 kHz -> fichier WAV mono lisible partout."""
    with wave.open(path, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(ulaw_to_pcm16(ulaw))


def save_stereo_wav(path: str, left_ulaw: bytes, right_ulaw: bytes) -> None:
    """Deux pistes µ-law -> WAV stéréo (gauche = appelant, droite = agent).

    Le format des enregistrements « dual channel » de Twilio : les deux côtés
    de l'appel restent distincts à l'écoute comme à l'analyse.
    """
    length = max(len(left_ulaw), len(right_ulaw))
    left = ulaw_to_pcm16(left_ulaw.ljust(length, bytes([SILENCE_BYTE])))
    right = ulaw_to_pcm16(right_ulaw.ljust(length, bytes([SILENCE_BYTE])))
    interleaved = bytearray(2 * len(left))
    view = memoryview(interleaved).cast("h")
    lview = memoryview(left).cast("h")
    rview = memoryview(right).cast("h")
    for i in range(len(lview)):
        view[2 * i] = lview[i]
        view[2 * i + 1] = rview[i]
    with wave.open(path, "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(bytes(interleaved))


# ------------------------------------------------------------------ événements
def stream_token(secret: str, params: dict[str, str]) -> str:
    """Jeton qui autorise l'ouverture de /ws — MÊME calcul que server._stream_token.

    server.py refuse tout flux dont les customParameters ne portent pas ce
    HMAC : c'est ce qui empêche n'importe qui d'atteindre wss://HOTE/ws en se
    faisant passer pour l'opérateur. Le faux opérateur connaît
    RUNTIME_API_SECRET, il signe donc comme le vrai TwiML.
    test_twilio_media.py vérifie que les deux implémentations coïncident.
    """
    canonical = "&".join(f"{k}={params[k]}" for k in sorted(params))
    return hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()


def signed_parameters(
    secret: str,
    caller: str = "",
    direction: str = "inbound",
    demo_name: str = "",
    demo_lang: str = "",
) -> dict[str, str]:
    """Les customParameters complets (jeton compris) d'un appel entrant simulé.

    `demo_name` (prénom pour saluer) et `demo_lang` (langue de session) sont
    inclus dans la signature seulement s'ils sont non vides, comme le fait
    /demo/token côté serveur.
    """
    params = {"direction": direction, "caller": caller}
    if demo_name:
        params["demo_name"] = demo_name
    if demo_lang:
        params["demo_lang"] = demo_lang
    return {**params, "tok": stream_token(secret, params)}


def connected_event() -> dict:
    """Premier message de Twilio après l'ouverture du websocket."""
    return {"event": "connected", "protocol": "Call", "version": "1.0.0"}


def start_event(stream_sid: str, call_sid: str, custom_parameters: dict[str, str]) -> dict:
    """Deuxième message : les métadonnées du flux, dont nos customParameters."""
    return {
        "event": "start",
        "sequenceNumber": "1",
        "streamSid": stream_sid,
        "start": {
            "streamSid": stream_sid,
            "callSid": call_sid,
            "accountSid": "ACfakecarrier",
            "tracks": ["inbound"],
            "mediaFormat": {"encoding": "audio/x-mulaw", "sampleRate": SAMPLE_RATE, "channels": 1},
            "customParameters": custom_parameters,
        },
    }


def media_event(stream_sid: str, ulaw_frame: bytes) -> dict:
    return {
        "event": "media",
        "streamSid": stream_sid,
        "media": {"payload": base64.b64encode(ulaw_frame).decode()},
    }


def stop_event(stream_sid: str) -> dict:
    return {"event": "stop", "streamSid": stream_sid}


def media_payload(message: dict) -> bytes | None:
    """L'audio µ-law d'un événement « media » du serveur, sinon None."""
    if message.get("event") != "media":
        return None
    return base64.b64decode(message["media"]["payload"])


def dumps(event: dict) -> str:
    return json.dumps(event)


def iter_frames(ulaw: bytes, frame_bytes: int = FRAME_BYTES):
    """Tranche un tampon µ-law en trames de 20 ms, la dernière complétée de silence."""
    for i in range(0, len(ulaw), frame_bytes):
        frame = ulaw[i : i + frame_bytes]
        if len(frame) < frame_bytes:
            frame = frame + bytes([SILENCE_BYTE]) * (frame_bytes - len(frame))
        yield frame
