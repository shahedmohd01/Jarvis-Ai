# Mini ChatGPT Web Application - Implementation Plan

We will create a full-stack, modern, high-performance Mini ChatGPT web application powered by Python (FastAPI) on the backend and an ultra-sleek, responsive frontend web UI using standard HTML5, CSS3 (Vanilla design system with glassmorphism, dark/light themes), and JavaScript with real-time token streaming via Server-Sent Events (SSE).

---

## Key Features
1. **Real-time Token Streaming**: AI responses stream token-by-token into the chat UI just like ChatGPT.
2. **Rich Markdown & Code Highlighting**: Supports formatted text, math/LaTeX formatting, tables, and code blocks with syntax highlighting and instant "Copy Code" buttons.
3. **Multimodal Attachments**: Upload images and document files for Gemini to analyze.
4. **Chat History & Management**: Sidebar to organize past conversations (stored securely in local storage), edit titles, search, delete, or export transcripts.
5. **Customizable Settings**: Select Gemini models (`gemini-2.5-flash`, `gemini-2.5-pro`), adjust temperature, set system instructions (personas), and manage API key configuration.
6. **Starter Prompt Cards**: Quick-start prompt cards on empty chat screen to jumpstart conversations.
7. **Single Command Run**: Simple Python script with FastAPI server that hosts both API backend and the static web app on `http://localhost:8000`.

---

## User Review Required

> [!IMPORTANT]
> **API Key Setup**: The app will support both setting your `GEMINI_API_KEY` in a `.env` file on the backend OR entering your key directly in the web UI settings modal for browser-based convenience.

---

## Proposed Changes

### Backend (Python FastAPI)

#### [NEW] [requirements.txt](file:///d:/mini%20gpt/requirements.txt)
- Dependencies: `fastapi`, `uvicorn[standard]`, `google-genai`, `python-dotenv`, `pydantic`.

#### [NEW] [.env.example](file:///d:/mini%20gpt/.env.example)
- Environment file template with `GEMINI_API_KEY=your_gemini_api_key_here`.

#### [NEW] [app.py](file:///d:/mini%20gpt/app.py)
- FastAPI backend application.
- API Endpoints:
  - `POST /api/chat/stream`: SSE endpoint for streaming responses from Gemini.
  - `GET /api/models`: Returns list of available Gemini models.
  - `GET /api/health`: Health check and API key validation.
- Static file mount serving `static/` folder on `/`.

---

### Frontend Web UI

#### [NEW] [static/index.html](file:///d:/mini%20gpt/static/index.html)
- Main HTML structure including collapsible sidebar, header with model picker, message history container, starter cards, custom modals (Settings, System Prompt), and chat input container.

#### [NEW] [static/style.css](file:///d:/mini%20gpt/static/style.css)
- Premium dark/light design system with modern typography, glassmorphism, responsive grid/flex layout, sleek scrollbars, micro-animations, and ChatGPT-style message bubbles.

#### [NEW] [static/script.js](file:///d:/mini%20gpt/static/script.js)
- Core client logic:
  - EventSource / SSE reader for streaming LLM text.
  - LocalStorage chat persistence & session switching.
  - Markdown rendering using `marked.js` and `highlight.js`.
  - File/Image preview & base64 encoding.
  - Theme switching, settings management, and keyboard shortcuts.

---

## Verification Plan

### Automated Tests
- Environment & Python dependency verification: `python -m pip install -r requirements.txt`.
- Backend startup check: `python app.py` to ensure server initializes cleanly.

### Manual Verification
- Test real-time streaming response from Gemini.
- Test Markdown and code block syntax highlighting with copy buttons.
- Test image file upload and multimodal interaction.
- Test sidebar chat management (creating new chats, switching chats, deleting chats).
