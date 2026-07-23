"""Serveur téléphonie du runtime auto-hébergé.

Routes :
  POST /twilio/inbound   — webhook voix Twilio -> TwiML <Connect><Stream>
  POST /telnyx/inbound   — webhook TeXML Telnyx (équivalent)
  WS   /ws               — flux média de l'appel -> pipeline vocal (bot.py)
  POST /outbound         — déclenché par le cron Next.js : compose une mission
  GET  /health

Lancement :  uvicorn server:app --host 0.0.0.0 --port 8000
"""

import base64
import hashlib
import hmac
import json
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import JSONResponse, Response
from loguru import logger

import bot
import config
import piper_http


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Vérifie voix ET route de synthèse Piper au démarrage, avant le premier appel."""
    voices = sorted({config.PIPER_VOICE_FR, config.PIPER_VOICE_EN, config.PIPER_VOICE_ES})
    try:
        config.PIPER_SYNTHESIZE_PATH = await piper_http.check_piper_server(
            config.PIPER_BASE_URL, voices, config.PIPER_SYNTHESIZE_PATH
        )
        logger.info(
            f"Serveur Piper OK (synthèse sur POST {config.PIPER_SYNTHESIZE_PATH}), "
            f"voix servies : {', '.join(voices)}"
        )
    except piper_http.PiperMisconfigured:
        # Le serveur a répondu : il tourne. Voix absente, route fausse, ou URL qui
        # ne pointe pas sur un serveur Piper : trois pannes que l'attente ne
        # corrige pas et que rien ne signalerait ensuite (voix muette ou mauvaise
        # langue, pour le seul appelant). On refuse de démarrer.
        #
        # Placé AVANT le `except Exception` ci-dessous à dessein : c'est lui qui,
        # sinon, rétrograderait une configuration fausse en simple avertissement
        # et laisserait booter un runtime incapable de parler.
        raise
    except Exception as err:  # noqa: BLE001
        # Piper injoignable : il démarre peut-être encore. Ne pas bloquer le
        # runtime pour autant — un appel produira une erreur explicite.
        logger.warning(
            f"Serveur Piper injoignable sur {config.PIPER_BASE_URL} ({err}). "
            "Ni les voix ni la route de synthèse n'ont pu être vérifiées. "
            "Voir runtime/README.md."
        )
        if config.PIPER_SYNTHESIZE_PATH == piper_http.SYNTHESIZE_PATH_AUTO:
            # La détection n'a pas eu lieu : il faut bien viser quelque chose.
            config.PIPER_SYNTHESIZE_PATH = piper_http.SYNTHESIZE_PATH_CURRENT
            logger.warning(
                f"Route de synthèse non détectée : "
                f"POST {config.PIPER_SYNTHESIZE_PATH} (défaut piper-tts >= 1.5.0)."
            )
    yield


app = FastAPI(title="runtime-vocal", lifespan=lifespan)


def _authorized(request: Request) -> bool:
    header = request.headers.get("authorization", "")
    return hmac.compare_digest(header, f"Bearer {config.RUNTIME_API_SECRET}")


# Jeton qui lie le flux média à CE serveur : seul un TwiML que nous avons généré
# (donc qui connaît RUNTIME_API_SECRET) peut ouvrir /ws avec des paramètres donnés.
# Sans lui, quiconque atteint wss://<host>/ws pourrait forger un appelant / jobId.
def _stream_token(params: dict[str, str]) -> str:
    canonical = "&".join(f"{k}={params[k]}" for k in sorted(params))
    return hmac.new(config.RUNTIME_API_SECRET.encode(), canonical.encode(), hashlib.sha256).hexdigest()


def _stream_twiml(params: dict[str, str]) -> str:
    """TwiML/TeXML : connecte l'appel au websocket média de ce serveur."""
    signed = {**params, "tok": _stream_token(params)}
    custom = "".join(f'<Parameter name="{k}" value="{v}"/>' for k, v in signed.items())
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<Response><Connect><Stream url="wss://{config.PUBLIC_HOST}/ws">{custom}</Stream></Connect></Response>'
    )


# Validation de signature Twilio (algorithme documenté : HMAC-SHA1 de l'URL suivie
# des paramètres POST triés, en base64). Implémenté en stdlib pour ne pas tirer le
# SDK Twilio. Fail-closed : sans auth token configuré, on rejette.
def _valid_twilio_signature(request: Request, form: dict[str, str]) -> bool:
    token = config.TWILIO_AUTH_TOKEN
    if not token:
        return False
    url = f"https://{config.PUBLIC_HOST}{request.url.path}"
    data = url + "".join(f"{k}{form[k]}" for k in sorted(form))
    digest = hmac.new(token.encode(), data.encode("utf-8"), hashlib.sha1).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(expected, request.headers.get("X-Twilio-Signature", ""))


# ---------------------------------------------------------------- entrant
@app.post("/twilio/inbound")
async def twilio_inbound(request: Request) -> Response:
    form = {k: str(v) for k, v in (await request.form()).items()}
    if not _valid_twilio_signature(request, form):
        logger.warning("Webhook Twilio refusé : signature invalide")
        return Response(status_code=403)
    caller = form.get("From", "")
    logger.info(f"Appel entrant de {caller}")
    return Response(
        content=_stream_twiml({"direction": "inbound", "caller": caller}),
        media_type="text/xml",
    )


@app.post("/telnyx/inbound")
async def telnyx_inbound(request: Request) -> Response:
    # Fail-closed tant que Telnyx n'est pas la cible active : la validation de
    # signature Telnyx (Ed25519 sur timestamp+corps, avec la clé publique du
    # portail) doit être implémentée AVANT d'activer ce fournisseur.
    if config.TELEPHONY_PROVIDER != "telnyx":
        logger.warning("Webhook Telnyx refusé : fournisseur inactif")
        return Response(status_code=403)
    form = {k: str(v) for k, v in (await request.form()).items()}
    caller = form.get("From", "")
    return Response(
        content=_stream_twiml({"direction": "inbound", "caller": caller}),
        media_type="text/xml",
    )


# ---------------------------------------------------------------- sortant
@app.post("/outbound")
async def outbound(request: Request) -> JSONResponse:
    """Compose un appel de mission (rendez-vous/taxi/resto) via l'API Twilio."""
    if not _authorized(request):
        return JSONResponse({"error": "non autorisé"}, status_code=401)
    body = await request.json()
    job_id: str = body["job_id"]
    to_number: str = body["to_number"]

    if config.TELEPHONY_PROVIDER != "twilio":
        return JSONResponse(
            {"error": "sortant implémenté pour twilio uniquement (Telnyx: à venir)"},
            status_code=501,
        )

    twiml = _stream_twiml({"direction": "outbound", "jobId": job_id})
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{config.TWILIO_ACCOUNT_SID}/Calls.json",
            auth=(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN),
            data={"To": to_number, "From": config.TWILIO_FROM_NUMBER, "Twiml": twiml},
        )
    if res.status_code >= 300:
        logger.error(f"Twilio outbound {res.status_code}: {res.text}")
        return JSONResponse({"error": res.text}, status_code=502)
    call_sid = res.json()["sid"]
    logger.info(f"Mission {job_id} : appel {call_sid} vers {to_number}")
    return JSONResponse({"call_id": call_sid})


# ---------------------------------------------------------------- média WS
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()

    if config.TELEPHONY_PROVIDER == "telnyx":
        from pipecat.serializers.telnyx import TelnyxFrameSerializer

        start = json.loads(await websocket.receive_text())
        while start.get("event") != "start":
            start = json.loads(await websocket.receive_text())
        stream_id = start.get("stream_id") or start["start"].get("stream_id", "")
        call_control_id = start["start"].get("call_control_id", "")
        custom = start["start"].get("custom_parameters", {}) or {}
        serializer = TelnyxFrameSerializer(
            stream_id=stream_id,
            call_control_id=call_control_id,
            api_key=config.TELNYX_API_KEY,
            outbound_encoding="PCMU",
            inbound_encoding="PCMU",
        )
        call_id = call_control_id or stream_id
    else:
        from pipecat.serializers.twilio import TwilioFrameSerializer

        # Twilio envoie d'abord {"event":"connected"} puis {"event":"start"}
        start = json.loads(await websocket.receive_text())
        while start.get("event") != "start":
            start = json.loads(await websocket.receive_text())
        stream_sid = start["start"]["streamSid"]
        call_sid = start["start"]["callSid"]
        custom = start["start"].get("customParameters", {}) or {}
        serializer = TwilioFrameSerializer(
            stream_sid=stream_sid,
            call_sid=call_sid,
            account_sid=config.TWILIO_ACCOUNT_SID,
            auth_token=config.TWILIO_AUTH_TOKEN,  # permet le raccrochage automatique
        )
        call_id = call_sid

    # Refuser tout flux qui n'a pas été ouvert par notre TwiML (jeton signé).
    received_tok = str(custom.get("tok", ""))
    signed_params = {k: str(v) for k, v in custom.items() if k != "tok"}
    if not hmac.compare_digest(received_tok, _stream_token(signed_params)):
        logger.warning(f"WS refusé (call {call_id}) : jeton de flux invalide")
        await websocket.close(code=1008)
        return

    direction = custom.get("direction", "inbound")
    try:
        await bot.run_call(
            websocket=websocket,
            serializer=serializer,
            call_id=call_id,
            direction=direction,
            caller_number=custom.get("caller"),
            job_id=custom.get("jobId"),
        )
    except Exception as err:  # noqa: BLE001
        logger.exception(f"Appel {call_id} en erreur : {err}")


@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "telephony": config.TELEPHONY_PROVIDER,
        "llm": config.LLM_PROVIDER,
        "stt": f"faster-whisper/{config.WHISPER_MODEL}",
        "tts": f"piper/{config.PIPER_VOICE_FR}+{config.PIPER_VOICE_EN}+{config.PIPER_VOICE_ES}",
    }
