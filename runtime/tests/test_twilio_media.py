# Le faux opérateur (twilio_media.py) doit rester indiscernable du vrai côté
# serveur : même codec, même cadre de 20 ms, et surtout MÊME jeton de flux que
# server._stream_token — c'est le test qui lie les deux implémentations.

import os
import sys
import tempfile
import unittest
from math import pi, sin
from pathlib import Path

os.environ.setdefault("RUNTIME_API_SECRET", "test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import twilio_media as tm


class UlawCodecTests(unittest.TestCase):
    def test_zero_encodes_to_silence_byte(self) -> None:
        self.assertEqual(tm.pcm16_to_ulaw(b"\x00\x00"), bytes([tm.SILENCE_BYTE]))

    def test_decode_then_encode_is_identity_for_255_codes(self) -> None:
        # Chaque code µ-law désigne un niveau de quantification : re-encoder ce
        # niveau doit rendre le code de départ. Seule exception, prévue par
        # G.711 : 0x7F est le « zéro négatif », il décode en 0, qui se
        # re-encode en zéro positif (0xFF).
        for code in range(256):
            expected = bytes([tm.SILENCE_BYTE if code == 0x7F else code])
            pcm = tm.ulaw_to_pcm16(bytes([code]))
            self.assertEqual(tm.pcm16_to_ulaw(pcm), expected, f"code {code:#04x}")

    def test_sine_round_trip_stays_close(self) -> None:
        samples = [int(20000 * sin(2 * pi * 440 * i / tm.SAMPLE_RATE)) for i in range(800)]
        pcm = b"".join(s.to_bytes(2, "little", signed=True) for s in samples)
        decoded = tm.ulaw_to_pcm16(tm.pcm16_to_ulaw(pcm))
        out = [int.from_bytes(decoded[2 * i : 2 * i + 2], "little", signed=True) for i in range(800)]
        error = sum((a - b) ** 2 for a, b in zip(samples, out, strict=True)) / len(samples)
        signal = sum(a**2 for a in samples) / len(samples)
        self.assertLess(error / signal, 0.01)  # ~20 dB de marge sur le SNR µ-law

    def test_resample_halves_and_keeps_rate(self) -> None:
        pcm_16k = bytes(3200)  # 100 ms à 16 kHz
        self.assertEqual(len(tm.resample_pcm16(pcm_16k, 16000, 8000)), 1600)
        self.assertEqual(tm.resample_pcm16(pcm_16k, 8000, 8000), pcm_16k)


class FramingTests(unittest.TestCase):
    def test_frames_are_20ms_and_last_is_padded(self) -> None:
        frames = list(tm.iter_frames(bytes([0x55]) * 400))
        self.assertEqual([len(f) for f in frames], [160, 160, 160])
        self.assertEqual(frames[2][80:], bytes([tm.SILENCE_BYTE]) * 80)

    def test_wav_round_trip(self) -> None:
        # Du µ-law déjà normalisé (sortie d'un encodage), pour que l'aller-retour
        # soit exact : le « zéro négatif » 0x7F, lui, reviendrait en 0xFF.
        ulaw = tm.pcm16_to_ulaw(bytes(range(256)) * 25)  # 1600 octets pairs -> 800 éch.
        ulaw = ulaw.replace(b"\x7f", bytes([tm.SILENCE_BYTE]))
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "a.wav")
            tm.save_ulaw_as_wav(path, ulaw)
            # 8 kHz -> 8 kHz : aucune interpolation, le µ-law doit revenir tel quel.
            self.assertEqual(tm.load_wav_as_ulaw(path), ulaw)

    def test_stereo_wav_pads_shorter_track(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "mix.wav")
            tm.save_stereo_wav(path, bytes([tm.SILENCE_BYTE]) * 320, bytes([tm.SILENCE_BYTE]) * 160)
            import wave

            with wave.open(path, "rb") as wav:
                self.assertEqual(wav.getnchannels(), 2)
                self.assertEqual(wav.getnframes(), 320)


class StreamTokenTests(unittest.TestCase):
    # LE test qui compte : si server._stream_token change, le faux opérateur ne
    # doit plus pouvoir ouvrir /ws sans que la CI le dise.
    def test_token_matches_server_implementation(self) -> None:
        import server

        params = {"direction": "inbound", "caller": "+33612345678"}
        self.assertEqual(
            tm.stream_token(os.environ["RUNTIME_API_SECRET"], params),
            server._stream_token(params),
        )

    def test_signed_parameters_verify_like_server_does(self) -> None:
        import server

        signed = tm.signed_parameters(os.environ["RUNTIME_API_SECRET"], caller="")
        received_tok = signed.pop("tok")
        self.assertEqual(received_tok, server._stream_token(signed))


class EventShapeTests(unittest.TestCase):
    def test_start_event_carries_what_server_reads(self) -> None:
        event = tm.start_event("MZx", "CAx", {"direction": "inbound", "caller": "", "tok": "t"})
        self.assertEqual(event["event"], "start")
        self.assertEqual(event["start"]["streamSid"], "MZx")
        self.assertEqual(event["start"]["callSid"], "CAx")
        self.assertEqual(event["start"]["customParameters"]["tok"], "t")

    def test_media_payload_round_trip(self) -> None:
        frame = bytes([tm.SILENCE_BYTE]) * tm.FRAME_BYTES
        event = tm.media_event("MZx", frame)
        self.assertEqual(tm.media_payload(event), frame)
        self.assertIsNone(tm.media_payload(tm.stop_event("MZx")))


if __name__ == "__main__":
    unittest.main()
