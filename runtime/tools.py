"""Outils exposés au LLM — miroir exact de web/src/lib/agents/tools.ts.

Les schémas sont déclarés ici (format Pipecat), mais l'EXÉCUTION est
entièrement déléguée à l'API Next.js (/api/tools/execute) : une seule
implémentation des skills, quel que soit le runtime vocal.
"""

from collections.abc import Awaitable, Callable

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.services.llm_service import FunctionCallParams

import api_client


def _schema(name: str, description: str, properties: dict, required: list[str]) -> FunctionSchema:
    return FunctionSchema(name=name, description=description, properties=properties, required=required)


END_CALL = _schema(
    "end_call",
    "Termine l'appel poliment (après avoir dit au revoir).",
    {},
    [],
)


def inbound_tools() -> ToolsSchema:
    """Outils de l'agent entrant (assistant personnel)."""
    return ToolsSchema(
        standard_tools=[
            _schema(
                "list_events",
                "Liste les rendez-vous de l'agenda de l'utilisateur pour un jour donné.",
                {
                    "day": {
                        "type": "string",
                        "description": "Jour au format AAAA-MM-JJ, ou 'today'/'tomorrow'",
                    }
                },
                ["day"],
            ),
            _schema(
                "create_event",
                "PROPOSE un nouveau rendez-vous. confirmed=false renvoie une proposition à lire "
                "à voix haute ; confirmed=true seulement après un 'oui' explicite.",
                {
                    "title": {"type": "string"},
                    "start": {"type": "string", "description": "Début ISO 8601"},
                    "duration_minutes": {"type": "number"},
                    "confirmed": {"type": "boolean"},
                },
                ["title", "start", "confirmed"],
            ),
            _schema(
                "move_event",
                "PROPOSE de déplacer un rendez-vous existant. Même règle de confirmation.",
                {
                    "event_query": {"type": "string"},
                    "new_start": {"type": "string"},
                    "confirmed": {"type": "boolean"},
                },
                ["event_query", "new_start", "confirmed"],
            ),
            _schema(
                "set_reminder",
                "Programme un rappel envoyé par SMS au moment voulu.",
                {
                    "text": {"type": "string"},
                    "due_at": {"type": "string", "description": "ISO 8601"},
                    "recurrence": {"type": "string", "enum": ["none", "daily", "weekly", "monthly"]},
                },
                ["text", "due_at"],
            ),
            _schema("list_reminders", "Liste les rappels à venir.", {}, []),
            _schema(
                "did_i_already",
                "Répond à « est-ce que j'ai déjà fait X ? » via les rappels marqués faits.",
                {"what": {"type": "string"}},
                ["what"],
            ),
            _schema("mark_done", "Marque une action comme faite.", {"what": {"type": "string"}}, ["what"]),
            _schema(
                "get_weather",
                "Météo d'une ville (aujourd'hui ou demain).",
                {"city": {"type": "string"}, "day": {"type": "string", "enum": ["today", "tomorrow"]}},
                [],
            ),
            _schema(
                "get_directions",
                "Itinéraire : résumé vocal + étapes envoyées par SMS.",
                {
                    "destination": {"type": "string"},
                    "origin": {"type": "string"},
                    "mode": {"type": "string", "enum": ["walking", "driving", "transit"]},
                },
                ["destination"],
            ),
            _schema(
                "find_contact",
                "Cherche un contact dans le carnet Google.",
                {"name": {"type": "string"}},
                ["name"],
            ),
            _schema(
                "send_sms",
                "PROPOSE un SMS dicté (relecture puis confirmed=true). Protégé : code requis "
                "(request_code puis verify_code).",
                {
                    "to_name": {"type": "string"},
                    "to_number": {"type": "string"},
                    "body": {"type": "string"},
                    "confirmed": {"type": "boolean"},
                },
                ["body", "confirmed"],
            ),
            _schema(
                "place_call",
                "PROPOSE un appel passé à la place de l'utilisateur (rendez-vous, taxi, resto). "
                "Récapitulatif puis confirmed=true. Protégé : code requis (request_code puis "
                "verify_code). Résultat par SMS.",
                {
                    "kind": {"type": "string", "enum": ["appointment", "taxi", "resto", "generic"]},
                    "goal": {"type": "string"},
                    "target_name": {"type": "string"},
                    "target_number": {"type": "string"},
                    "constraints": {"type": "string"},
                    "confirmed": {"type": "boolean"},
                },
                ["kind", "goal", "confirmed"],
            ),
            _schema(
                "remember",
                "Retient une information durable (ex: médecin traitant).",
                {"key": {"type": "string"}, "value": {"type": "string"}},
                ["key", "value"],
            ),
            _schema(
                "recall",
                "Recherche dans la mémoire de l'utilisateur.",
                {"query": {"type": "string"}},
                ["query"],
            ),
            _schema(
                "request_code",
                "Envoie un code à 4 chiffres par SMS au numéro enregistré. À appeler la première fois "
                "que l'utilisateur demande quelque chose de protégé (lire agenda/contacts/rappels/notes, "
                "modifier l'agenda, envoyer un SMS, passer un appel).",
                {},
                [],
            ),
            _schema(
                "verify_code",
                "Vérifie le code que l'utilisateur dit ou tape au clavier. Débloque les actions protégées "
                "pour le reste de l'appel. Ne jamais répéter le code à voix haute.",
                {"code": {"type": "string"}},
                ["code"],
            ),
            _schema(
                "get_current_time",
                "Donne l'heure locale actuelle dans une ville.",
                {
                    "city": {
                        "type": "string",
                        "description": "Ville dont l'heure locale est demandée",
                    }
                },
                ["city"],
            ),
            _schema(
                "define",
                "Donne la définition d'un mot anglais.",
                {"word": {"type": "string", "description": "Le mot anglais à définir"}},
                ["word"],
            ),
            _schema(
                "convert",
                "Convertit une valeur entre unités (distance, poids, température, volume, vitesse) "
                "ou entre devises (codes ISO comme EUR, USD).",
                {
                    "value": {"type": "number", "description": "La valeur numérique à convertir"},
                    "from": {
                        "type": "string",
                        "description": "Unité ou devise de départ, ex. 'km', 'kg', 'celsius', 'EUR'",
                    },
                    "to": {
                        "type": "string",
                        "description": "Unité ou devise d'arrivée, ex. 'miles', 'lb', 'fahrenheit', 'USD'",
                    },
                },
                ["value", "from", "to"],
            ),
            _schema(
                "report_unsupported_request",
                "À appeler UNE fois quand l'appelant demande quelque chose qu'AUCUN autre outil ne "
                "sait faire — une capacité manquante. Décris la CAPABILITÉ manquante en anglais, en "
                "termes généraux, pas les détails privés de l'appelant. notify_caller=true seulement "
                "si tu as proposé un SMS et que l'appelant a dit oui.",
                {
                    "request_summary": {"type": "string"},
                    "caller_words": {"type": "string"},
                    "language": {"type": "string", "enum": ["en", "fr"]},
                    "notify_caller": {"type": "boolean"},
                },
                ["request_summary"],
            ),
            END_CALL,
        ]
    )


def outbound_tools() -> ToolsSchema:
    """Outils des missions sortantes (rendez-vous / taxi / resto)."""
    return ToolsSchema(
        standard_tools=[
            _schema(
                "report_outcome",
                "Rapporte le résultat final de la mission (à appeler UNE fois avant de raccrocher). "
                "details sera envoyé tel quel par SMS au client : rédige-le pour lui.",
                {
                    "status": {"type": "string", "enum": ["success", "failed", "voicemail", "needs_user"]},
                    "details": {"type": "string"},
                },
                ["status", "details"],
            ),
            END_CALL,
        ]
    )


def make_tool_handler(
    call_id: str,
    job_id: str | None,
    hangup: Callable[[], Awaitable[None]],
) -> Callable[[FunctionCallParams], Awaitable[None]]:
    """Handler attrape-tout : forwarde chaque appel d'outil vers l'API Next."""

    async def handler(params: FunctionCallParams) -> None:
        if params.function_name == "end_call":
            await params.result_callback("Appel terminé.")
            await hangup()
            return
        try:
            result = await api_client.execute_tool(
                call_id, params.function_name, params.arguments or {}, job_id
            )
        except Exception as err:  # noqa: BLE001 — l'agent doit rester en ligne
            result = f"Désolé, ce service ne répond pas ({type(err).__name__})."
        await params.result_callback(result)

    return handler
