"""Serveur téléphonie du runtime auto-hébergé.

Routes :
  POST /twilio/inbound   — webhook voix Twilio -> TwiML <Connect><Stream>
  POST /telnyx/inbound   — webhook TeXML Telnyx (équivalent)
  WS   /ws               — flux média de l'appel -> pipeline vocal (bot.py)
  POST /outbound         — déclenché par le cron Next.js : compose une mission
  GET  /health

Lancement :  uvicorn server:app --host 0.0.0.0 --port 8000
"""

import hmac
import json

import httpx
from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import JSONResponse, Response
from loguru import logger

import bot
import config

app = FastAPI(title="runtime-vocal")


def _authorized(request: Request) -> bool:
    header = request.headers.get("authorization", "")
    return hmac.compare_digest(header, f"Bearer {config.RUNTIME_API_SECRET}")


def _stream_twiml(params: dict[str, str]) -> str:
    """TwiML/TeXML : connecte l'appel au websocket média de ce serveur."""
    custom = "".join(f'<Parameter name="{k}" value="{v}"/>' for k, v in params.items())
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<Response><Connect><Stream url="wss://{config.PUBLIC_HOST}/ws">{custom}</Stream></Connect></Response>'
    )


# ---------------------------------------------------------------- entrant
@app.post("/twilio/inbound")
async def twilio_inbound(request: Request) -> Response:
    form = await request.form()
    caller = str(form.get("From", ""))
    logger.info(f"Appel entrant de {caller}")
    return Response(
        content=_stream_twiml({"direction": "inbound", "caller": caller}),
        media_type="text/xml",
    )


@app.post("/telnyx/inbound")
async def telnyx_inbound(request: Request) -> Response:
    form = await request.form()
    caller = str(form.get("From", ""))
    return Response(
        content=_stream_twiml({"direction": "inbound", "caller": caller}),
        media_type="text/xml",
    )


# ---------------------------------------------------------------- sortant
@app.post("/outbound")
async def outbound(request: Request) -> JSONResponse:
    """Compose un appel de mission (docteur/taxi/resto) via l'API Twilio."""
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
        "tts": f"piper/{config.PIPER_VOICE}",
    }
