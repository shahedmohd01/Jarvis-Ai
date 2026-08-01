import os
import json
import asyncio
import base64
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Server instance - v1.0.1
app = FastAPI(title="Jarvis AI - Gemini Powered", version="1.0.1")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper function to get Gemini client/model
def get_api_key(headers_api_key: Any = None, body_api_key: Any = None) -> str:
    h_key = headers_api_key if isinstance(headers_api_key, str) else None
    b_key = body_api_key if isinstance(body_api_key, str) else None
    key = b_key or h_key or os.getenv("GEMINI_API_KEY")
    if not key or not isinstance(key, str) or key.strip() == "":
        raise HTTPException(
            status_code=401,
            detail="Gemini API Key is missing. Please enter a valid API key in Settings or set GEMINI_API_KEY in .env."
        )
    return key.strip()

# Available Gemini Models using valid Google API model names
AVAILABLE_MODELS = [
    {
        "id": "gemini-3.6-flash",
        "name": "Gemini 3.6 Flash",
        "description": "Fastest and most capable model for general tasks & coding",
        "recommended": True
    },
    {
        "id": "gemini-3.5-flash",
        "name": "Gemini 3.5 Flash",
        "description": "High capability flash model"
    },
    {
        "id": "gemini-3.1-flash-lite",
        "name": "Gemini 3.1 Flash Lite",
        "description": "Lightweight & instant response"
    }
]

# Map dropdown selection/aliases to official Google API model identifiers
MODEL_ALIASES = {
    "gemini-3.6-flash": "gemini-3.6-flash",
    "gemini-3.5-flash": "gemini-3.5-flash",
    "gemini-3.1-flash-lite": "gemini-3.1-flash-lite",
    "gemini-2.5-flash": "gemini-3.6-flash",
    "gemini-2.5-pro": "gemini-3.6-flash",
    "gemini-3.0-flash": "gemini-3.6-flash",
    "gemini-flash-latest": "gemini-3.6-flash",
    "gemini-pro-latest": "gemini-3.6-flash",
    "gemini-2.0-flash": "gemini-3.6-flash",
    "gemini-1.5-flash": "gemini-3.6-flash",
    "gemini-1.5-pro": "gemini-3.6-flash",
}

class ChatMessage(BaseModel):
    role: str # "user" or "model" / "assistant"
    content: str
    image: Optional[Dict[str, str]] = None # {"mime_type": "image/jpeg", "data": "base64..."}

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str = "gemini-3.6-flash"
    temperature: float = 0.7
    system_instruction: Optional[str] = None
    api_key: Optional[str] = None

@app.get("/api/models")
async def list_models():
    return {"models": AVAILABLE_MODELS}

@app.get("/api/health")
async def health_check(x_gemini_api_key: Optional[str] = Header(None)):
    has_key = bool(os.getenv("GEMINI_API_KEY") or x_gemini_api_key)
    return {
        "status": "online",
        "api_key_configured": has_key
    }

@app.api_route("/api/chat/stream", methods=["POST", "GET"])
@app.api_route("/api/chat/stream/", methods=["POST", "GET"])
@app.api_route("/api/chat", methods=["POST", "GET"])
@app.api_route("/api/chat/", methods=["POST", "GET"])
async def chat_stream(raw_request: Request, x_gemini_api_key: Optional[str] = Header(None)):
    if raw_request.method == "GET":
        return JSONResponse({"status": "active", "message": "Endpoint active."})

    async def stream_generator():
        try:
            body = await raw_request.json()
            request = ChatRequest(**body)
            api_key = get_api_key(x_gemini_api_key, request.api_key)
            target_model = MODEL_ALIASES.get(request.model, request.model if request.model in MODEL_ALIASES.values() else "gemini-3.6-flash")

            try:
                from google import genai
                from google.genai import types

                client = genai.Client(api_key=api_key)
                raw_contents = []
                for msg in request.messages:
                    role = "user" if msg.role in ["user", "human"] else "model"
                    parts = []
                    if msg.image and "data" in msg.image and "mime_type" in msg.image:
                        image_bytes = base64.b64decode(msg.image["data"])
                        parts.append(types.Part.from_bytes(data=image_bytes, mime_type=msg.image["mime_type"]))
                    if msg.content:
                        parts.append(types.Part.from_text(text=msg.content))
                    if parts:
                        raw_contents.append(types.Content(role=role, parts=parts))

                contents = []
                for c in raw_contents:
                    if contents and contents[-1].role == c.role:
                        contents[-1].parts.extend(c.parts)
                    else:
                        contents.append(c)

                config = types.GenerateContentConfig(
                    temperature=request.temperature,
                    system_instruction=request.system_instruction if request.system_instruction else None
                )

                response = client.models.generate_content_stream(
                    model=target_model,
                    contents=contents,
                    config=config
                )
                for chunk in response:
                    if chunk.text:
                        yield f"data: {json.dumps({'text': chunk.text})}\n\n"
                        await asyncio.sleep(0.01)
                yield f"data: {json.dumps({'done': True})}\n\n"

            except ImportError:
                import google.generativeai as genai
                genai.configure(api_key=api_key)
                model_instance = genai.GenerativeModel(
                    model_name=target_model,
                    generation_config={"temperature": request.temperature},
                    system_instruction=request.system_instruction if request.system_instruction else None
                )
                formatted_contents = []
                for msg in request.messages:
                    role = "user" if msg.role in ["user", "human"] else "model"
                    parts = []
                    if msg.image and "data" in msg.image and "mime_type" in msg.image:
                        image_bytes = base64.b64decode(msg.image["data"])
                        parts.append({"mime_type": msg.image["mime_type"], "data": image_bytes})
                    if msg.content:
                        parts.append(msg.content)
                    formatted_contents.append({"role": role, "parts": parts})

                response = model_instance.generate_content(formatted_contents, stream=True)
                for chunk in response:
                    if chunk.text:
                        yield f"data: {json.dumps({'text': chunk.text})}\n\n"
                        await asyncio.sleep(0.01)
                yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as e:
            err_msg = str(e)
            if "API_KEY_INVALID" in err_msg or "401" in err_msg or "missing" in err_msg.lower() or "unauthorized" in err_msg.lower():
                err_msg = "Invalid or missing Gemini API Key. Please verify your GEMINI_API_KEY in .env."
            elif "RESOURCE_EXHAUSTED" in err_msg or "429" in err_msg or "quota" in err_msg.lower():
                err_msg = "Gemini API rate limit or quota exceeded. Please try again in a few moments."
            elif "not found" in err_msg.lower() or "404" in err_msg:
                err_msg = f"Selected model ({target_model}) is not supported."
            yield f"data: {json.dumps({'error': err_msg})}\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")

# Serve Frontend static directory
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def root():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Jarvis AI Backend is running."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)


    