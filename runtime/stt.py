"""Reconnaissance vocale, au choix : STT_PROVIDER (même principe que LLM_PROVIDER).

`whisper` (défaut) — 100 % local, aucune clé, rien ne sort de la machine.
C'est la promesse du runtime auto-hébergé, et sur une ligne téléphonique elle
se paie : Whisper a été entraîné sur du 16 kHz large bande, il faut donc lui
rééchantillonner le 8 kHz de la ligne (voir whisper_stt.py), et même une fois
la fréquence remise d'équerre la bande passante téléphonique lui coûte des
mots. Il est aussi SEGMENTÉ : rien ne sort avant la fin du tour de parole, et
le tour entier passe alors dans le modèle d'un coup. Sur un CPU de portable
c'est deux à trois secondes avant que l'agent ouvre la bouche.

`deepgram` — le transcripteur des agents Vapi, dont Alice. Entraîné sur de la
téléphonie, il consomme le 8 kHz NATIVEMENT (aucun rééchantillonnage) et il
STREAME : il transcrit pendant qu'on parle au lieu d'attendre la fin. Les deux
raisons pour lesquelles un agent Vapi répond du tac au tac là où le nôtre
marque un temps. En échange : une clé d'API, et l'audio de l'appel qui sort de
la machine.

Le choix est un simple réglage parce que le reste du pipeline ne bouge pas :
les deux services s'insèrent à la même place et émettent la même TranscriptionFrame.
Sans DEEPGRAM_API_KEY, on retombe sur Whisper en le disant plutôt que de casser
l'appel.
"""

from loguru import logger
from pipecat.transcriptions.language import Language

import config
import vocabulary
from whisper_stt import PhoneWhisperSTTService

WHISPER = "whisper"
DEEPGRAM = "deepgram"


def stt_language_for(language: str) -> Language:
    """Langue STT de la session ("fr" | "en" | "es").

    Épinglée, jamais auto-détectée : le WhisperSTTService de Pipecat exige une
    langue concrète (run_stt fait assert_given(settings.language)).
    """
    return {"en": Language.EN, "es": Language.ES}.get(language, Language.FR)


def provider() -> str:
    """Fournisseur réellement utilisable, pas seulement celui demandé."""
    if config.STT_PROVIDER == DEEPGRAM:
        if config.DEEPGRAM_API_KEY:
            return DEEPGRAM
        logger.warning(
            "STT_PROVIDER=deepgram mais DEEPGRAM_API_KEY est vide : "
            "l'appel se fera avec Whisper local."
        )
    return WHISPER


def loads_a_model() -> bool:
    """Vrai si le fournisseur charge des poids en mémoire (donc à précharger).

    Deepgram est un websocket vers leur API : il n'y a rien à charger, et
    l'avance tenue par bot.py n'a pas d'objet.
    """
    return provider() == WHISPER


def build_service(stt_language: Language):
    """Service STT du fournisseur choisi, prêt à brancher dans le pipeline."""
    if provider() == DEEPGRAM:
        from pipecat.services.deepgram.stt import DeepgramSTTService

        # sample_rate laissé à None : le service prend celle du pipeline, soit
        # les 8 kHz de la ligne. C'est justement ce qu'on veut ici, à l'inverse
        # de Whisper — rééchantillonner pour Deepgram ne ferait qu'ajouter du
        # bruit à une entrée qu'il gère nativement.
        return DeepgramSTTService(
            api_key=config.DEEPGRAM_API_KEY,
            settings=DeepgramSTTService.Settings(
                model=config.DEEPGRAM_MODEL,
                language=stt_language,
                # Ponctuation et nombres écrits en clair : le LLM lit « 14h30 »
                # plus sûrement que « quatorze heures trente ».
                smart_format=True,
                # Résultats partiels : c'est ce qui permet au reste du pipeline
                # de savoir qu'on parle avant qu'on ait fini.
                interim_results=True,
                # Silence qui clôt le tour, en millisecondes.
                endpointing=config.DEEPGRAM_ENDPOINTING,
                # Le levier qui compte : pondérer notre vocabulaire pendant le
                # décodage (villes, verbes d'outils). Voir vocabulary.py.
                keyterm=vocabulary.terms_for(str(stt_language)),
            ),
        )

    return PhoneWhisperSTTService(
        device=config.WHISPER_DEVICE,
        compute_type=config.WHISPER_COMPUTE_TYPE,
        settings=PhoneWhisperSTTService.Settings(
            model=config.WHISPER_MODEL,
            language=stt_language,
        ),
    )
