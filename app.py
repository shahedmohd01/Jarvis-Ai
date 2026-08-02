import os
import json
import asyncio
import base64
import traceback
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Request, HTTPException, Header
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(title="Jarvis AI - Gemini Powered", version="1.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_api_key(headers_api_key: Any = None, body_api_key: Any = None) -> str:
    key = (
        (body_api_key if isinstance(body_api_key, str) else None)
        or (headers_api_key if isinstance(headers_api_key, str) else None)
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
    )
    if not key or not isinstance(key, str) or not key.strip():
        raise HTTPException(status_code=401, detail="Gemini API Key missing.")
    return key.strip()

AVAILABLE_MODELS = [
    {
        "id": "gemini-3.5-flash",
        "name": "Gemini 3.5 Flash",
        "description": "Recommended - Fastest & highly intelligent model",
        "recommended": True,
    },
    {
        "id": "gemini-3.5-pro",
        "name": "Gemini 3.5 Pro",
        "description": "Ultra intelligence for complex reasoning and coding",
        "recommended": False,
    },
    {
        "id": "gemini-2.5-flash",
        "name": "Gemini 2.5 Flash",
        "description": "Fast and versatile standard model",
        "recommended": False,
    },
    {
        "id": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "description": "Highly capable reasoning model",
        "recommended": False,
    },
    {
        "id": "gemini-3.5-flash-lite",
        "name": "Gemini 3.5 Flash Lite",
        "description": "High capability lightweight model",
        "recommended": False,
    },
    {
        "id": "gemini-3.1-flash-lite",
        "name": "Gemini 3.1 Flash Lite",
        "description": "Fast and versatile lightweight model",
        "recommended": False,
    },
    {
        "id": "gemini-2.5-flash-lite",
        "name": "Gemini 2.5 Flash Lite",
        "description": "Next-gen efficient multimodal model",
        "recommended": False,
    }
]

DEFAULT_SYSTEM_INSTRUCTION = (
    "You are Jarvis AI, a helpful, professional, and highly capable AI assistant. "
    "If asked about your name, identity, or who created you, always respond that you are Jarvis AI, powered by Google Gemini. "
    "Provide direct, well-structured, and accurate responses. "
    "Avoid casual filler, conversational fluff, or overly simplistic analogies unless explicitly asked. "
    "Use clear markdown headings, lists, bold text, and precise terminology to present information professionally."
)

@app.get("/api/models")
async def list_models():
    return {"models": AVAILABLE_MODELS}

@app.get("/api/health")
async def health_check(x_gemini_api_key: Optional[str] = Header(None)):
    has_key = bool(os.getenv("GEMINI_API_KEY") or x_gemini_api_key)
    return {"status": "online", "api_key_configured": has_key}

@app.api_route("/api/chat/stream", methods=["POST", "GET"])
@app.api_route("/api/chat/stream/", methods=["POST", "GET"])
@app.api_route("/api/chat", methods=["POST", "GET"])
@app.api_route("/api/chat/", methods=["POST", "GET"])
async def chat_stream(raw_request: Request, x_gemini_api_key: Optional[str] = Header(None)):
    if raw_request.method == "GET":
        return JSONResponse({"status": "active", "message": "Endpoint active."})

    try:
        body = await raw_request.json()
        messages = body.get("messages", [])
        provided_key = body.get("api_key")
        temperature = float(body.get("temperature", 0.7))
        system_instruction = body.get("system_instruction")
        
        if not system_instruction or not system_instruction.strip():
            system_instruction = DEFAULT_SYSTEM_INSTRUCTION
        else:
            identity_prefix = (
                "You are Jarvis AI, a helpful, professional, and highly capable AI assistant. "
                "If asked about your name, identity, or who created you, always respond that you are Jarvis AI, powered by Google Gemini. "
            )
            system_instruction = identity_prefix + system_instruction.strip()
            
        model = body.get("model", "gemini-3.5-flash-lite")
        api_key = get_api_key(x_gemini_api_key, provided_key)
    except Exception as e:
        print("--- REQUEST PARSING ERROR ---")
        traceback.print_exc()
        return JSONResponse({"detail": f"Invalid request body or API Key missing: {str(e)}"}, status_code=400)

    async def stream_generator():
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=api_key)
            
            last_image_idx = -1
            for i, msg in enumerate(messages):
                if msg.get("image") and isinstance(msg["image"], dict) and "data" in msg["image"]:
                    last_image_idx = i

            raw_contents = []
            for i, msg in enumerate(messages):
                role = "user" if msg.get("role") in ["user", "human"] else "model"
                content_text = msg.get("content", "")
                img_data = msg.get("image") if i == last_image_idx else None
                parts = []
                
                if img_data and isinstance(img_data, dict) and "data" in img_data and "mime_type" in img_data:
                    image_bytes = base64.b64decode(img_data["data"])
                    parts.append(types.Part.from_bytes(data=image_bytes, mime_type=img_data["mime_type"]))
                if content_text:
                    parts.append(types.Part.from_text(text=str(content_text)))
                
                if parts:
                    raw_contents.append(types.Content(role=role, parts=parts))

            config = types.GenerateContentConfig(
                temperature=temperature,
                system_instruction=system_instruction if system_instruction else None
            )

            response = await client.aio.models.generate_content_stream(
                model=model,
                contents=raw_contents,
                config=config
            )

            async for chunk in response:
                text_content = chunk.text if hasattr(chunk, "text") and chunk.text else ""
                if text_content:
                    yield f"data: {json.dumps({'text': text_content})}\n\n"
                    await asyncio.sleep(0.01)

            yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as e:
            print("--- CHAT ERROR TRACEBACK ---")
            traceback.print_exc()
            err_msg = str(e)
            yield f"data: {json.dumps({'error': err_msg})}\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")

@app.get("/")
async def get_index():
    return FileResponse("index.html")

@app.get("/index.html")
async def get_index_html():
    return FileResponse("index.html")

@app.get("/style.css")
async def get_style():
    return FileResponse("style.css", media_type="text/css")

@app.get("/script.js")
async def get_script():
    return FileResponse("script.js", media_type="application/javascript")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)