from fastapi import FastAPI, Request
from langchain_google_genai import ChatGoogleGenerativeAI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from langchain_community.graphs import Neo4jGraph
import os
import re
from pathlib import Path
from dotenv import load_dotenv

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

load_dotenv(Path(__file__).parent / ".env")
api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise RuntimeError("GOOGLE_API_KEY not set. Add it to backend/.env or to the environment.")

os.environ["GOOGLE_API_KEY"] = api_key

# Connect Neo4j 
graph = Neo4jGraph(
    url="bolt://localhost:7687",  
    username="neo4j",             
    password=os.getenv("NEO4J_PASSWORD")      
)

# Gemini model
llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=0)

@app.get("/")
def root():
    return {"message": "Neo4j is connected!"}



@app.post("/query")
async def query_db(request: Request):
    data = await request.json()
    user_prompt = data["prompt"]
    history = data.get("history", [])  # list of {role, text, cypher_query?, results?}

    # Build a readable conversation context for the LLM
    convo_lines = []
    for m in history:
        role = m.get("role", "user")
        text = m.get("text", "")
        if role == "user":
            convo_lines.append(f"User: {text}")
        else:
            convo_lines.append(f"Assistant: {text}")
            if m.get("cypher_query"):
                convo_lines.append(f"Cypher: {m['cypher_query']}")
            if m.get("results"):
                convo_lines.append(f"Results: {m['results']}")
    convo = "\n".join(convo_lines)

    #  Generate Cypher query 
    cypher_prompt = (
        "Convert the final user's request into a Cypher query. "
        "Use the DB relations (DIRECTED, roles, ACTED_IN, PRODUCED, Movie). "
        "If the user refers to prior answers, use the previous Cypher/Results from the conversation. "
        "Return only the query (you may wrap it in ```cypher ... ```).\n\n"
        f"Conversation:\n{convo}\nUser: {user_prompt}\n"
    )
    raw_cypher = llm.invoke(cypher_prompt).content
    # If the model returns a fenced code block (```cypher\n...```) extract inner content
    m = re.search(r"```(?:\w+)?\n([\s\S]*?)```", raw_cypher)
    if m:
        cypher_query = m.group(1).strip()
    else:
        # Remove any remaining triple backticks and surrounding quotes
        cypher_query = raw_cypher.replace("```", "").strip()
        if (cypher_query.startswith('"') and cypher_query.endswith('"')) or (
            cypher_query.startswith("'") and cypher_query.endswith("'")
        ):
            cypher_query = cypher_query[1:-1].strip()

    # Run query in Neo4j
    try:
        results = graph.query(cypher_query)
        results = [dict(r) for r in results]
        results = jsonable_encoder(results)
    except Exception as e:
        return {"error": str(e), "cypher_query": cypher_query}

    # Explain results with context
    explanation_prompt = (
        "Given the conversation and these DB results, reply normally to the user's last question in a human friendly way. "
        "Only use the data from the DB results. Do not invent facts.\n\n"
        f"Conversation:\n{convo}\nUser: {user_prompt}\nResults: {results}\n\nAnswer:"
    )
    explanation = llm.invoke(explanation_prompt).content if results else "No results found in the database."

    return {
        "cypher_query": cypher_query,
        "results": results,
        "explanation": explanation
    }
