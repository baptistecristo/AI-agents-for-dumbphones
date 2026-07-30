"""Le vocabulaire que l'agent s'attend à entendre, par langue.

Une ligne téléphonique coupe tout au-dessus de 4 kHz. Ce qui disparaît là-dedans,
ce sont les fricatives et les fins de mots — précisément ce qui distingue deux
mots par ailleurs proches. Le transcripteur ne rend alors pas du charabia : il
rend le mot le plus probable de sa langue, qui n'est pas le nôtre.

    « quel temps fait-il à Lyon »  ->  « quel temps fait-il l'avion ? »

Les noms propres sont les premières victimes : une ville n'a pas de contexte
grammatical qui la rattrape. D'où cette liste, qui n'invente rien mais remonte
la probabilité des mots que NOS outils savent traiter.

Les deux transcripteurs l'utilisent, chacun à sa façon :
  - Deepgram `keyterm` (nova-3) : pondération à la volée, pendant le décodage.
    C'est le levier le plus efficace des deux, et il accepte les accents — le
    `keywords` de nova-2, lui, fait rejeter la configuration entière sur un
    accent ou un trait d'union.
  - faster-whisper `hotwords` : même intention, effet plus faible. À traiter
    comme un rattrapage partiel, pas comme un équivalent.
"""

# Verbes et noms qui déclenchent nos outils, plus les unités qu'on lit à voix
# haute. Pas de phrases : ce sont des termes isolés qu'on veut voir reconnus.
_SKILLS = {
    "fr": [
        "météo", "temps", "degrés", "pluie", "soleil", "heure", "horaire",
        "convertis", "conversion", "euros", "dollars", "kilomètres", "miles",
        "kilos", "livres", "définition", "signifie", "itinéraire", "trajet",
        "adresse", "contact", "numéro", "rappel", "rappelle", "rappeler",
        "message", "envoie", "appelle", "note", "souviens", "aujourd'hui",
        "demain", "ce soir", "matin", "après-midi", "minutes", "heures",
    ],
    "en": [
        "weather", "forecast", "degrees", "rain", "sunny", "time", "clock",
        "convert", "conversion", "euros", "dollars", "kilometres", "miles",
        "kilos", "pounds", "definition", "means", "directions", "route",
        "address", "contact", "number", "reminder", "remind", "message",
        "send", "call", "note", "remember", "today", "tomorrow", "tonight",
        "morning", "afternoon", "minutes", "hours",
    ],
    "es": [
        "tiempo", "clima", "grados", "lluvia", "sol", "hora", "horario",
        "convierte", "conversión", "euros", "dólares", "kilómetros", "millas",
        "kilos", "libras", "definición", "significa", "ruta", "camino",
        "dirección", "contacto", "número", "recordatorio", "recuérdame",
        "mensaje", "envía", "llama", "nota", "recuerda", "hoy", "mañana",
        "esta noche", "tarde", "minutos", "horas",
    ],
}

# Les villes que la météo, l'heure locale et les itinéraires font citer. Une
# ville mal entendue, c'est un outil appelé pour le mauvais endroit ou pas
# appelé du tout : c'est le cas qui nous a coûté le plus d'appels ratés.
_CITIES = {
    "fr": [
        "Paris", "Lyon", "Marseille", "Toulouse", "Bordeaux", "Lille", "Nantes",
        "Strasbourg", "Nice", "Rennes", "Montpellier", "Grenoble", "Toulon",
        "Bruxelles", "Genève", "Lausanne", "Montréal", "Londres", "Berlin",
        "Madrid", "Rome", "Lisbonne", "Tokyo", "New York",
    ],
    "en": [
        "London", "Manchester", "Birmingham", "Glasgow", "Edinburgh", "Dublin",
        "Paris", "Berlin", "Madrid", "Rome", "Lisbon", "Amsterdam", "Brussels",
        "Geneva", "New York", "Boston", "Chicago", "Tokyo", "Sydney",
    ],
    "es": [
        "Madrid", "Barcelona", "Valencia", "Sevilla", "Zaragoza", "Málaga",
        "Bilbao", "Granada", "Lisboa", "París", "Roma", "Berlín", "Londres",
        "Ginebra", "Buenos Aires", "México", "Bogotá", "Tokio", "Nueva York",
    ],
}


def terms_for(language: str) -> list[str]:
    """Vocabulaire attendu dans cette langue ("fr" | "en" | "es")."""
    key = language if language in _SKILLS else "fr"
    return _SKILLS[key] + _CITIES[key]


def hotwords_for(language: str) -> str:
    """Même liste, au format attendu par faster-whisper (une seule chaîne)."""
    return " ".join(terms_for(language))
