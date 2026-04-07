from langchain_community.utilities import SQLDatabase
from langchain_groq import ChatGroq
from langchain_community.agent_toolkits import create_sql_agent

# Your settings object already read the .env file for us!
from app.core.config import settings

def ask_database_question(question: str) -> str:
    """
    Takes a plain English question, converts it to SQL, runs it against 
    the PostgreSQL database, and returns a natural language answer using Groq & Llama 3.
    """
    
    # ─── THE FIX: Pull the key directly from Pydantic settings ───
    api_key = settings.GROQ_API_KEY
    
    if not api_key:
        return "Error: GROQ_API_KEY is not set in the .env file."

    try:
        # 1. Connect to PostgreSQL
        db = SQLDatabase.from_uri(settings.SQLALCHEMY_DATABASE_URI)
        
        # 2. Initialize the Groq LLM Brain
        llm = ChatGroq(
            model="llama-3.3-70b-versatile", 
            temperature=0, 
            api_key=api_key
        )
        
        # 3. Create the SQL Agent
        agent_executor = create_sql_agent(llm, db=db, agent_type="tool-calling", verbose=True)
        
        # 4. Run the user's question
        response = agent_executor.invoke({"input": question})
        
        return response["output"]
        
    except Exception as e:
        return f"I ran into an issue trying to query the database: {str(e)}"