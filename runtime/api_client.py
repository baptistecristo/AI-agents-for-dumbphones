"""Client HTTP vers l'API Next.js — sessions, outils, fin d'appel.

Le runtime ne contient AUCUNE logique métier : prompts, skills, auth d'appel et
consentements vivent côté Next.js ; ce module ne fait que transporter.
"""

from typing import Any

import httpx

import config

_HEADERS = {
    "Authorization": f"Bearer {config.RUNTIME_API_SECRET}",
    "Content-Type": "application/json",
}


async def open_session(
    provider_call_id: str,
    direction: str,
    caller_number: str | None = None,
    job_id: str | None = None,
) -> dict[str, Any]:
    """Ouvre la session d'appel et récupère prompt système + message d'accueil."""
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(
            f"{config.NEXT_API_URL}/api/runtime/session",
            headers=_HEADERS,
            json={
                "provider_call_id": provider_call_id,
                "direction": direction,
                "caller_number": caller_number,
                "job_id": job_id,
            },
        )
        res.raise_for_status()
        return res.json()


async def execute_tool(
    call_id: str,
    name: str,
    arguments: dict[str, Any],
    job_id: str | None = None,
) -> str:
    """Exécute un outil côté Next.js et renvoie le texte résultat."""
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            f"{config.NEXT_API_URL}/api/tools/execute",
            headers=_HEADERS,
            json={"call_id": call_id, "name": name, "arguments": arguments, "job_id": job_id},
        )
        res.raise_for_status()
        return res.json()["result"]


async def end_call(
    call_id: str,
    transcript: str | None = None,
    ended_reason: str = "hangup",
    job_id: str | None = None,
) -> None:
    async with httpx.AsyncClient(timeout=15) as client:
        await client.post(
            f"{config.NEXT_API_URL}/api/runtime/end",
            headers=_HEADERS,
            json={
                "call_id": call_id,
                "transcript": transcript,
                "ended_reason": ended_reason,
                "job_id": job_id,
            },
        )
