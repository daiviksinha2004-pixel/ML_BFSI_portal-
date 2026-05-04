import logging
import re
from threading import Lock

from langchain_community.agent_toolkits import create_sql_agent
from langchain_community.utilities import SQLDatabase
from langchain_groq import ChatGroq

from app.core.config import settings

logger = logging.getLogger(__name__)

_AGENT_EXECUTOR = None
_AGENT_LOCK = Lock()

_GREETING_REGEX = re.compile(r"^(hi|hello|hey|yo|hii+|heyy+)$", re.IGNORECASE)
_SMALL_TALK_REGEX = re.compile(
    r"^(thanks|thank you|ok|okay|cool|great|bye|goodbye|good night|good morning)$",
    re.IGNORECASE,
)
_DATA_HINTS = (
    "count", "total", "sum", "average", "avg", "highest", "lowest",
    "top", "trend", "month", "year", "campaign", "policy", "premium",
    "debt", "collection", "defaulter", "customer", "state", "zone",
    "dashboard", "report", "records", "table", "sql", "data", "list",
)


def _is_greeting(text: str) -> bool:
    return bool(_GREETING_REGEX.match(text.strip()))


def _is_small_talk(text: str) -> bool:
    return bool(_SMALL_TALK_REGEX.match(text.strip()))


def _looks_like_data_question(text: str) -> bool:
    lowered = text.lower()
    if "?" in lowered:
        return True
    return any(token in lowered for token in _DATA_HINTS)


def _build_fast_reply(text: str) -> str | None:
    if _is_greeting(text):
        return "Hi! What would you like to ask about your data?"
    if _is_small_talk(text):
        if "thank" in text.lower():
            return "You're welcome. Ask me any data question and I will help."
        if "bye" in text.lower():
            return "Bye. I am here whenever you need data insights."
        return "Sure. What would you like to ask about your data?"
    if len(text.split()) <= 3 and not _looks_like_data_question(text):
        return (
            "I can help with your BFSI database insights. "
            "Try asking: total policies this month, top default states, or campaign-wise collections."
        )
    return None


def _get_agent_executor():
    global _AGENT_EXECUTOR
    if _AGENT_EXECUTOR is not None:
        return _AGENT_EXECUTOR

    with _AGENT_LOCK:
        if _AGENT_EXECUTOR is not None:
            return _AGENT_EXECUTOR

        api_key = settings.GROQ_API_KEY
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not set in the environment.")

        db = SQLDatabase.from_uri(settings.SQLALCHEMY_DATABASE_URI)
        llm = ChatGroq(
            model="llama-3.3-70b-versatile",
            temperature=0,
            api_key=api_key,
        )

        _AGENT_EXECUTOR = create_sql_agent(
            llm,
            db=db,
            agent_type="tool-calling",
            verbose=False,
            max_iterations=4,
            max_execution_time=20,
            top_k=10,
        )
        return _AGENT_EXECUTOR


def ask_database_question(question: str) -> str:
    """
    Handles quick conversational queries instantly and routes data queries
    through a cached SQL agent for better latency and consistency.
    """
    cleaned = (question or "").strip()
    if not cleaned:
        return "Please type a question."

    fast_reply = _build_fast_reply(cleaned)
    if fast_reply:
        return fast_reply

    try:
        agent_executor = _get_agent_executor()
        prompt = (
            "You are a BFSI data copilot. Use SQL tools to answer accurately.\n"
            "Rules:\n"
            "1) Keep response concise and clear.\n"
            "2) If data is unavailable, say so plainly.\n"
            "3) If question is ambiguous, ask one specific clarifying question.\n\n"
            f"User question: {cleaned}"
        )
        response = agent_executor.invoke({"input": prompt})
        answer = (response or {}).get("output", "").strip()
        if answer:
            return answer
        return "I could not generate an answer for that. Please rephrase the question."
    except Exception:
        logger.exception("Chatbot query failed")
        return "I ran into an issue while querying the database. Please try again in a moment."

