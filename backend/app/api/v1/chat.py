from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.chatbot import ask_database_question

router = APIRouter()

# Pydantic model for the incoming request body
class ChatRequest(BaseModel):
    question: str

@router.post("/ask")
def chat_with_data(request: ChatRequest):
    """
    Endpoint for the frontend chatbot UI. Accepts a question and returns the AI's answer.
    """
    if not request.question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
        
    answer = ask_database_question(request.question)
    
    return {
        "question": request.question,
        "answer": answer
    }