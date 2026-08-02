import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInAnonymously, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==========================================================================
// FIREBASE CLIENT CONFIGURATION
// ==========================================================================
// Replace this placeholder config with your actual Firebase Project keys from Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyDnjcsDE6uOTnsdJWvZP_QYdEQ6bkkOXK4",
    authDomain: "jarvis-ai-713ff.firebaseapp.com",
    projectId: "jarvis-ai-713ff",
    storageBucket: "jarvis-ai-713ff.firebasestorage.app",
    messagingSenderId: "194615172927",
    appId: "1:194615172927:web:c47cfd4ee00b72998dfd8a",
    measurementId: "G-RQ2WN5S6V8"
};

// Check if placeholder credentials are still present
const isFirebasePlaceholder = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_");

let auth;
if (!isFirebasePlaceholder) {
    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
    } catch (e) {
        console.error("Firebase initialization failed:", e);
    }
}

// ==========================================================================
// AUTHENTICATION SIMULATOR (MOCK AUTH)
// ==========================================================================
// This simulator runs if Firebase credentials are not set yet, so you can test Guest, Email,
// and Google logins immediately without setting up a Firebase backend first.
const mockAuth = {
    currentUser: null,
    listeners: [],
    onAuthStateChanged(callback) {
        this.listeners.push(callback);
        // Dispatch current state asynchronously
        setTimeout(() => callback(this.currentUser), 100);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    },
    updateState(user) {
        this.currentUser = user;
        this.listeners.forEach(callback => callback(user));
    },
    async signInAnonymously() {
        this.updateState({
            uid: "guest_session_user",
            isAnonymous: true,
            displayName: "Guest User",
            email: "",
            photoURL: ""
        });
        return { user: this.currentUser };
    },
    async signInWithGoogle() {
        this.updateState({
            uid: "google_oauth_user",
            isAnonymous: false,
            displayName: "Jarvis Tester",
            email: "tester@gmail.com",
            photoURL: "https://www.gstatic.com/images/branding/product/2x/avatar_112_color_96dp.png"
        });
        return { user: this.currentUser };
    },
    async signInWithEmail(email, password) {
        this.updateState({
            uid: "email_user_" + btoa(email).replace(/=/g, ""),
            isAnonymous: false,
            displayName: email.split('@')[0],
            email: email,
            photoURL: ""
        });
        return { user: this.currentUser };
    },
    async signUpWithEmail(email, password) {
        return this.signInWithEmail(email, password);
    },
    async signOut() {
        this.updateState(null);
    }
};

// Unified Auth Interface
const authManager = {
    onAuthStateChanged(callback) {
        if (!isFirebasePlaceholder && auth) {
            return onAuthStateChanged(auth, callback);
        } else {
            return mockAuth.onAuthStateChanged(callback);
        }
    },
    async signInAnonymously() {
        if (!isFirebasePlaceholder && auth) {
            return signInAnonymously(auth);
        } else {
            return mockAuth.signInAnonymously();
        }
    },
    async signInWithGoogle() {
        if (!isFirebasePlaceholder && auth) {
            const provider = new GoogleAuthProvider();
            return signInWithPopup(auth, provider);
        } else {
            return mockAuth.signInWithGoogle();
        }
    },
    async signInWithEmail(email, password) {
        if (!isFirebasePlaceholder && auth) {
            return signInWithEmailAndPassword(auth, email, password);
        } else {
            return mockAuth.signInWithEmail(email, password);
        }
    },
    async signUpWithEmail(email, password) {
        if (!isFirebasePlaceholder && auth) {
            return createUserWithEmailAndPassword(auth, email, password);
        } else {
            return mockAuth.signUpWithEmail(email, password);
        }
    },
    async signOut() {
        if (!isFirebasePlaceholder && auth) {
            return signOut(auth);
        } else {
            return mockAuth.signOut();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // State Variables
    let chats = [];
    let currentUser = null;
    let currentChatId = null;
    let selectedModel = localStorage.getItem('mini_gpt_model') || 'gemini-3.5-flash-lite';
    // API key is managed server-side on Render — not stored in the browser
    let temperature = parseFloat(localStorage.getItem('mini_gpt_temp') || '0.2');
    let systemInstruction = localStorage.getItem('mini_gpt_persona') || '';
    let currentAttachment = null; // { mime_type, data, name }
    let isGenerating = false;
    let abortController = null;

    // DOM Elements
    const sidebar = document.getElementById('sidebar');
    const openSidebarBtn = document.getElementById('openSidebarBtn');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const newChatBtn = document.getElementById('newChatBtn');
    const historyList = document.getElementById('historyList');
    const chatSearchInput = document.getElementById('chatSearchInput');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const apiStatusText = document.getElementById('apiStatusText');

    // Header Elements
    const modelPickerBtn = document.getElementById('modelPickerBtn');
    const currentModelName = document.getElementById('currentModelName');
    const modelDropdown = document.getElementById('modelDropdown');
    const statusBadge = document.getElementById('statusBadge');
    const statusLabel = document.getElementById('statusLabel');
    const clearChatBtn = document.getElementById('clearChatBtn');

    // Chat Elements
    const chatViewport = document.getElementById('chatViewport');
    const welcomeContainer = document.getElementById('welcomeContainer');
    const messagesList = document.getElementById('messagesList');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const attachBtn = document.getElementById('attachBtn');
    const fileInput = document.getElementById('fileInput');
    const filePreviewBar = document.getElementById('filePreviewBar');
    const filePreviewName = document.getElementById('filePreviewName');
    const filePreviewThumb = document.getElementById('filePreviewThumb');
    const removeFileBtn = document.getElementById('removeFileBtn');
    const starterCards = document.querySelectorAll('.starter-card');

    // Modals
    const settingsModal = document.getElementById('settingsModal');
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
    const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    const modelSelect = document.getElementById('modelSelect');
    const temperatureSlider = document.getElementById('temperatureSlider');
    const tempVal = document.getElementById('tempVal');

    const personaModal = document.getElementById('personaModal');
    const personaBtn = document.getElementById('personaBtn');
    const closePersonaModalBtn = document.getElementById('closePersonaModalBtn');
    const clearPersonaBtn = document.getElementById('clearPersonaBtn');
    const savePersonaBtn = document.getElementById('savePersonaBtn');
    const systemInstructionInput = document.getElementById('systemInstructionInput');
    const chipBtns = document.querySelectorAll('.chip-btn');

    // Camera & Voice Elements
    const cameraBtn = document.getElementById('cameraBtn');
    const micBtn = document.getElementById('micBtn');
    const cameraModal = document.getElementById('cameraModal');
    const cameraVideo = document.getElementById('cameraVideo');
    const cameraCanvas = document.getElementById('cameraCanvas');
    const closeCameraModalBtn = document.getElementById('closeCameraModalBtn');
    const cancelCameraBtn = document.getElementById('cancelCameraBtn');
    const capturePhotoBtn = document.getElementById('capturePhotoBtn');

    // Collapsible Menu & Input Box elements
    const addBtn = document.getElementById('addBtn');
    const attachmentMenu = document.getElementById('attachmentMenu');
    const addBtnIcon = document.getElementById('addBtnIcon');
    const inputBox = document.querySelector('.input-box');

    // Initialize Marked & Highlight.js
    if (window.marked) {
        marked.setOptions({
            gfm: true,
            breaks: true,
            highlight: function (code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (err) { }
                }
                return hljs.highlightAuto(code).value;
            }
        });
    }

    // --- INITIALIZATION ---
    function init() {
        // Load Saved Theme
        const savedTheme = localStorage.getItem('mini_gpt_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);

        // Load Settings to Inputs
        modelSelect.value = selectedModel;
        temperatureSlider.value = temperature;
        tempVal.textContent = temperature;
        systemInstructionInput.value = systemInstruction;
        updateCurrentModelLabel(selectedModel);

        // Check Backend Health & API Key Status
        checkBackendStatus();

        // Initialize Firebase Authentication State Observer
        authManager.onAuthStateChanged((user) => {
            handleAuthStateChanged(user);
        });

        // Initialize microphone vs send button visibility
        updateInputDisplay();
    }

    // Dynamic API URL Resolver
    // Production backend deployed on Render.com — API key lives there, never exposed to users
    const RENDER_BACKEND_URL = 'https://jarvis-ai-backend-8ndm.onrender.com';

    function getApiUrl(path) {
        // Local file or local dev server → use local Python backend
        if (window.location.protocol === 'file:') {
            return `http://127.0.0.1:8000${path}`;
        }
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            const port = window.location.port && window.location.port !== '80' ? `:${window.location.port}` : ':8000';
            return `http://127.0.0.1${port}${path}`;
        }
        // GitHub Pages or any other static host → use Render backend
        return `${RENDER_BACKEND_URL}${path}`;
    }

    async function checkBackendStatus() {
        const settingsBadge = document.getElementById('backendStatusLabel');
        const settingsBadgeWrap = document.getElementById('backendStatusBadge');
        try {
            const res = await fetch(getApiUrl('/api/health'));
            const data = await res.json();

            if (res.ok) {
                apiStatusText.textContent = 'Online';
                apiStatusText.style.color = '#10b981';
                if (statusLabel) statusLabel.textContent = 'Online';
                if (settingsBadge) settingsBadge.textContent = '✓ Connected to AI Backend (Online)';
                if (settingsBadgeWrap) settingsBadgeWrap.style.color = '#10b981';
            } else {
                apiStatusText.textContent = 'Offline';
                apiStatusText.style.color = '#ef4444';
                if (statusLabel) statusLabel.textContent = 'Offline';
                if (settingsBadge) settingsBadge.textContent = '⚠ Backend status error';
                if (settingsBadgeWrap) settingsBadgeWrap.style.color = '#ef4444';
            }
        } catch (e) {
            apiStatusText.textContent = 'Offline';
            apiStatusText.style.color = '#ef4444';
            if (statusLabel) statusLabel.textContent = 'Offline';
            if (settingsBadge) settingsBadge.textContent = '✗ Backend offline — try again later';
            if (settingsBadgeWrap) settingsBadgeWrap.style.color = '#ef4444';
        }
    }

    function updateCurrentModelLabel(modelId) {
        const names = {
            'gemini-3.5-flash': 'Gemini 3.5 Flash',
            'gemini-3.5-pro': 'Gemini 3.5 Pro',
            'gemini-2.5-flash': 'Gemini 2.5 Flash',
            'gemini-2.5-pro': 'Gemini 2.5 Pro',
            'gemini-3.5-flash-lite': 'Gemini 3.5 Flash Lite',
            'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
            'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite'
        };
        currentModelName.textContent = names[modelId] || modelId;
    }

    // --- CHAT MANAGEMENT ---
    function createNewChat() {
        const newChat = {
            id: 'chat_' + Date.now(),
            title: 'New Conversation',
            createdAt: new Date().toISOString(),
            messages: []
        };
        chats.unshift(newChat);
        saveChatsToStorage();
        renderHistory();
        selectChat(newChat.id);
    }

    function selectChat(chatId) {
        currentChatId = chatId;
        const activeChat = chats.find(c => c.id === chatId);

        // Highlight active item in sidebar
        document.querySelectorAll('.history-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === chatId);
        });

        if (!activeChat || activeChat.messages.length === 0) {
            welcomeContainer.style.display = 'block';
            messagesList.style.display = 'none';
            messagesList.innerHTML = '';
        } else {
            welcomeContainer.style.display = 'none';
            messagesList.style.display = 'flex';
            renderMessages(activeChat.messages);
        }
    }

    function renderHistory(filter = '') {
        historyList.innerHTML = '';
        const filtered = chats.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()));

        if (filtered.length === 0) {
            historyList.innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted); padding:8px;">No chats found</div>`;
            return;
        }

        filtered.forEach(chat => {
            const item = document.createElement('div');
            item.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
            item.dataset.id = chat.id;

            item.innerHTML = `
                <span class="history-title">${escapeHtml(chat.title)}</span>
                <div class="history-actions">
                    <button class="icon-btn delete-chat-btn" title="Delete Chat">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            `;

            item.addEventListener('click', (e) => {
                if (e.target.closest('.delete-chat-btn')) {
                    e.stopPropagation();
                    deleteChat(chat.id);
                } else {
                    selectChat(chat.id);
                    if (window.innerWidth <= 768) {
                        sidebar.classList.remove('open');
                    }
                }
            });

            historyList.appendChild(item);
        });
    }

    function deleteChat(chatId) {
        chats = chats.filter(c => c.id !== chatId);
        saveChatsToStorage();
        if (chats.length === 0) {
            createNewChat();
        } else {
            renderHistory();
            if (currentChatId === chatId) {
                selectChat(chats[0].id);
            }
        }
    }

    function getUserStorageKeys(user) {
        if (!user) return ['mini_gpt_chats_guest'];
        const keys = [];
        if (user.uid) keys.push(`mini_gpt_chats_${user.uid}`);
        if (user.email) {
            const cleanEmail = btoa(user.email.toLowerCase().trim()).replace(/=/g, '');
            keys.push(`mini_gpt_chats_usr_${cleanEmail}`);
        }
        return keys;
    }

    function saveChatsToStorage() {
        if (!currentUser) return;
        const keys = getUserStorageKeys(currentUser);
        const validChats = chats.filter(c => c && c.id);
        const jsonStr = JSON.stringify(validChats);
        keys.forEach(key => localStorage.setItem(key, jsonStr));
    }

    // --- MESSAGES RENDERING ---
    function renderMessages(messages) {
        messagesList.innerHTML = '';
        messages.forEach((msg, idx) => {
            appendMessageUI(msg.role, msg.content, msg.image, false, idx);
        });
        scrollToBottom();
    }

    function appendMessageUI(role, content, image = null, isStreaming = false, index = null) {
        const isUser = role === 'user';
        const row = document.createElement('div');
        row.className = `message-row ${isUser ? 'user-row' : 'ai-row'}`;
        if (index !== null) {
            row.dataset.index = index;
        }

        const avatarHtml = isUser
            ? `<div class="message-avatar">You</div>`
            : `<div class="message-avatar">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="#fff" stroke="none"/></svg>
               </div>`;

        let bodyHtml = '';
        if (image && image.data) {
            bodyHtml += `<img src="data:${image.mime_type};base64,${image.data}" class="message-image-attach" alt="User Image Attachment"/>`;
        }

        if (isUser) {
            bodyHtml += `<div class="message-bubble">${escapeHtml(content)}</div>`;
        } else {
            const parsedMarkdown = window.marked ? marked.parse(content || '') : escapeHtml(content);
            bodyHtml += `<div class="message-bubble">${parsedMarkdown}</div>`;
        }

        // Copy and Edit actions bar below bubbles
        let actionsHtml = '';
        if (!isStreaming) {
            actionsHtml = `
                <div class="message-actions">
                    <button class="action-btn copy-msg-btn" title="Copy text">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                    </button>
                    ${isUser ? `
                    <button class="action-btn edit-msg-btn" title="Edit message">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                    </button>
                    ` : ''}
                </div>
            `;
        }

        row.innerHTML = `
            ${avatarHtml}
            <div class="message-content-wrapper">
                ${bodyHtml}
                ${actionsHtml}
            </div>
        `;

        // Attach action buttons event listeners
        const copyBtn = row.querySelector('.copy-msg-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(content).then(() => {
                    const originalSvg = copyBtn.innerHTML;
                    copyBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#10b981" stroke-width="2">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    `;
                    setTimeout(() => { copyBtn.innerHTML = originalSvg; }, 2000);
                });
            });
        }

        const editBtn = row.querySelector('.edit-msg-btn');
        if (editBtn && isUser && index !== null) {
            editBtn.addEventListener('click', () => {
                startInlineEdit(row, content, index);
            });
        }

        messagesList.appendChild(row);

        // Add Copy Code Buttons for Assistant messages
        if (!isUser) {
            enhanceCodeBlocks(row);
        }

        if (!isStreaming) {
            scrollToBottom();
        }

        return row;
    }

    function enhanceCodeBlocks(container) {
        container.querySelectorAll('pre').forEach(pre => {
            if (pre.querySelector('.code-header')) return;

            const codeEl = pre.querySelector('code');
            const langClass = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
            const langName = langClass ? langClass.replace('language-', '') : 'code';

            const header = document.createElement('div');
            header.className = 'code-header';
            header.innerHTML = `
                <span>${langName}</span>
                <button class="copy-code-btn">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>Copy</span>
                </button>
            `;

            header.querySelector('.copy-code-btn').addEventListener('click', () => {
                const textToCopy = codeEl.innerText;
                navigator.clipboard.writeText(textToCopy).then(() => {
                    const btnSpan = header.querySelector('.copy-code-btn span');
                    btnSpan.textContent = 'Copied!';
                    setTimeout(() => { btnSpan.textContent = 'Copy'; }, 2000);
                });
            });

            pre.insertBefore(header, codeEl);
        });
    }

    function scrollToBottom() {
        chatViewport.scrollTop = chatViewport.scrollHeight;
    }

    function setGeneratingState(busy) {
        isGenerating = busy;
        if (!sendBtn) return;
        if (busy) {
            sendBtn.classList.add('generating-stop-btn');
            sendBtn.title = 'Stop Generating';
            sendBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
            `;
            if (inputBox) inputBox.classList.add('has-input');
            if (userInput) userInput.disabled = true;
        } else {
            sendBtn.classList.remove('generating-stop-btn');
            sendBtn.title = 'Send Message';
            sendBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
            `;
            if (userInput) {
                userInput.disabled = false;
                userInput.focus();
            }
            updateInputDisplay();
        }
    }

    // --- SEND MESSAGE & STREAMING ---
    async function sendMessage(textPrompt = null) {
        if (isGenerating) return; // Lock out secondary generation requests
        const text = textPrompt || userInput.value.trim();
        if (!text && !currentAttachment) return;

        // Abort voice listening immediately on send to prevent transcription updates to cleared input
        if (isListening) {
            abortListening();
        }

        const activeChat = chats.find(c => c.id === currentChatId);
        if (!activeChat) return;

        // Auto update title if first message
        if (activeChat.messages.length === 0) {
            activeChat.title = text.slice(0, 30) + (text.length > 30 ? '...' : '');
            renderHistory();
        }

        // Add user message to state
        const userMsg = {
            role: 'user',
            content: text,
            image: currentAttachment ? { mime_type: currentAttachment.mime_type, data: currentAttachment.data } : null
        };
        activeChat.messages.push(userMsg);
        saveChatsToStorage();

        // Hide welcome state
        welcomeContainer.style.display = 'none';
        messagesList.style.display = 'flex';

        // Append User UI (pass array index)
        appendMessageUI('user', text, userMsg.image, false, activeChat.messages.length - 1);

        // Reset Input Bar & Preview
        userInput.value = '';
        userInput.style.height = 'auto';
        clearAttachment();

        // Run streaming assistant response call
        await getAssistantResponse(activeChat);
    }

    async function getAssistantResponse(activeChat) {
        isGenerating = true;
        setGeneratingState(true);

        const aiRow = appendMessageUI('model', '', null, true, activeChat.messages.length);
        const bubble = aiRow.querySelector('.message-bubble');

        let fullAiText = '';

        try {
            abortController = new AbortController();

            const payload = {
                messages: activeChat.messages,
                model: selectedModel,
                temperature: temperature,
                system_instruction: systemInstruction
                // api_key intentionally omitted — key lives on the server
            };

            const headers = { 'Content-Type': 'application/json' };

            const response = await fetch(getApiUrl('/api/chat/stream'), {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload),
                signal: abortController.signal
            });

            if (!response.ok) {
                const errJson = await response.json().catch(() => ({ detail: `HTTP ${response.status}: ${response.statusText}` }));
                throw new Error(errJson.detail || errJson.message || `Server error (${response.status})`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep partial line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6).trim();
                        if (!jsonStr) continue;

                        try {
                            const parsed = JSON.parse(jsonStr);
                            if (parsed.error) {
                                throw new Error(parsed.error);
                            }
                            if (parsed.text) {
                                fullAiText += parsed.text;
                                bubble.innerHTML = window.marked ? marked.parse(fullAiText) : escapeHtml(fullAiText);
                                enhanceCodeBlocks(aiRow);
                                scrollToBottom();
                            }
                        } catch (e) {
                            if (e.message !== 'Unexpected end of JSON input') {
                                console.error('Error parsing SSE data:', e);
                                throw e;
                            }
                        }
                    }
                }
            }

            // Remove streaming skeleton state and final render with index
            aiRow.remove();

            activeChat.messages.push({ role: 'model', content: fullAiText });
            saveChatsToStorage();

            // Append clean final model UI bubble
            appendMessageUI('model', fullAiText, null, false, activeChat.messages.length - 1);

        } catch (err) {
            aiRow.remove();

            if (err.name === 'AbortError') {
                fullAiText += ' *(Response stopped by user)*';
            } else {
                let msg = err.message || 'Unknown error';
                if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
                    msg = 'Failed to connect to the AI backend. The server may be sleeping (free tier). Please wait 30 seconds and try again.';
                }
                fullAiText += `\n\n**Error**: ${msg}`;
            }

            activeChat.messages.push({ role: 'model', content: fullAiText });
            saveChatsToStorage();
            appendMessageUI('model', fullAiText, null, false, activeChat.messages.length - 1);
        } finally {
            isGenerating = false;
            setGeneratingState(false);
            abortController = null;
        }
    }

    // --- INLINE USER MESSAGE EDITING (Like Real Gemini) ---
    function startInlineEdit(row, originalContent, index) {
        const contentWrapper = row.querySelector('.message-content-wrapper');
        const originalHtml = contentWrapper.innerHTML;

        contentWrapper.innerHTML = `
            <div class="message-edit-container">
                <textarea class="message-edit-textarea">${escapeHtml(originalContent)}</textarea>
                <div class="message-edit-buttons">
                    <button class="btn btn-secondary btn-sm cancel-edit-btn">Cancel</button>
                    <button class="btn btn-primary btn-sm save-edit-btn">Save & Submit</button>
                </div>
            </div>
        `;

        const textarea = contentWrapper.querySelector('.message-edit-textarea');
        const cancelBtn = contentWrapper.querySelector('.cancel-edit-btn');
        const saveBtn = contentWrapper.querySelector('.save-edit-btn');

        // Focus and select end of text
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        cancelBtn.addEventListener('click', () => {
            const activeChat = chats.find(c => c.id === currentChatId);
            if (activeChat) {
                renderMessages(activeChat.messages);
            }
        });

        saveBtn.addEventListener('click', async () => {
            const newText = textarea.value.trim();
            if (!newText) return;

            const activeChat = chats.find(c => c.id === currentChatId);
            if (!activeChat) return;

            // Update user message content and truncate thread at this point
            activeChat.messages[index].content = newText;
            activeChat.messages = activeChat.messages.slice(0, index + 1);
            saveChatsToStorage();

            // Refresh message timeline
            renderMessages(activeChat.messages);

            // Trigger streaming of updated prompt response
            await getAssistantResponse(activeChat);
        });
    }

    function setGeneratingState(generating) {
        if (generating) {
            statusBadge.classList.add('generating');
            statusLabel.textContent = 'Gemini is typing...';
            sendBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
            sendBtn.title = 'Stop Generation';
        } else {
            statusBadge.classList.remove('generating');
            statusLabel.textContent = 'Ready';
            sendBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
            sendBtn.title = 'Send Message';
        }
    }

    // --- COLLAPSIBLE MENU ACTIONS ---
    if (addBtn) {
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isMenuOpen = attachmentMenu.classList.toggle('show');
            if (isMenuOpen) {
                addBtnIcon.style.transform = 'rotate(45deg)';
            } else {
                addBtnIcon.style.transform = 'none';
            }
        });
    }

    // Close floating attachment menu when clicking anywhere else
    document.addEventListener('click', () => {
        if (attachmentMenu && attachmentMenu.classList.contains('show')) {
            attachmentMenu.classList.remove('show');
            addBtnIcon.style.transform = 'none';
        }
    });

    // --- FILE ATTACHMENTS ---
    if (attachBtn) {
        attachBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
            if (attachmentMenu) {
                attachmentMenu.classList.remove('show');
                addBtnIcon.style.transform = 'none';
            }
        });
    }

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const base64Data = evt.target.result.split(',')[1];
            currentAttachment = {
                name: file.name,
                mime_type: file.type || 'image/png',
                data: base64Data
            };

            filePreviewName.textContent = file.name;
            if (file.type && file.type.startsWith('image/')) {
                filePreviewThumb.src = evt.target.result;
                filePreviewThumb.style.display = 'block';
            } else {
                filePreviewThumb.style.display = 'none';
            }
            filePreviewBar.style.display = 'block';
            updateInputDisplay();
        };
        reader.readAsDataURL(file);
    });

    removeFileBtn.addEventListener('click', clearAttachment);

    function clearAttachment() {
        currentAttachment = null;
        fileInput.value = '';
        filePreviewBar.style.display = 'none';
        updateInputDisplay();
    }

    // --- INPUT DISPLAY SYNC (MIC VS SEND BUTTON) ---
    function updateInputDisplay() {
        if (!inputBox) return;
        if (userInput.value.trim() !== '' || currentAttachment !== null) {
            inputBox.classList.add('has-input');
        } else {
            inputBox.classList.remove('has-input');
        }
    }

    // --- EVENT LISTENERS ---

    // Auto Resize Input Textarea & Mobile Keyboard Layout Sync
    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = Math.min(userInput.scrollHeight, 180) + 'px';
        updateInputDisplay();
    });

    // Reset viewport scroll when mobile keyboard dismisses to prevent sticky floating elements
    function resetMobileViewportScroll() {
        setTimeout(() => {
            window.scrollTo(0, 0);
            document.body.scrollTop = 0;
            if (chatViewport) {
                chatViewport.scrollTop = chatViewport.scrollHeight;
            }
        }, 80);
    }

    userInput.addEventListener('blur', () => {
        resetMobileViewportScroll();
    });

    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            userInput.blur(); // Dismiss soft keyboard on enter submit
            sendMessage();
        }
    });

    // VisualViewport listener for Mobile Safari & Chrome soft keyboard open/close sync
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            if (window.innerWidth <= 768) {
                if (chatViewport) scrollToBottom();
            }
        });
        window.visualViewport.addEventListener('scroll', () => {
            if (window.innerWidth <= 768 && document.activeElement !== userInput) {
                window.scrollTo(0, 0);
            }
        });
    }

    sendBtn.addEventListener('click', () => {
        if (isGenerating && abortController) {
            abortController.abort();
        } else {
            sendMessage();
        }
    });

    // Starter Prompt Cards Click
    starterCards.forEach(card => {
        card.addEventListener('click', () => {
            const prompt = card.getAttribute('data-prompt');
            sendMessage(prompt);
        });
    });

    // Sidebar Toggles
    openSidebarBtn.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('open');
        } else {
            sidebar.classList.toggle('collapsed');
        }
    });
    closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('open'));
    newChatBtn.addEventListener('click', createNewChat);

    // Search Box
    chatSearchInput.addEventListener('input', (e) => renderHistory(e.target.value));

    // Clear Chat
    clearChatBtn.addEventListener('click', () => {
        if (confirm('Clear messages in this conversation?')) {
            const activeChat = chats.find(c => c.id === currentChatId);
            if (activeChat) {
                activeChat.messages = [];
                saveChatsToStorage();
                selectChat(currentChatId);
            }
        }
    });

    // Theme Toggle
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem('mini_gpt_theme', nextTheme);
    });

    // Model Selector Dropdown
    modelPickerBtn.addEventListener('click', () => modelDropdown.classList.toggle('show'));
    document.addEventListener('click', (e) => {
        if (!modelPickerBtn.contains(e.target) && !modelDropdown.contains(e.target)) {
            modelDropdown.classList.remove('show');
        }
    });

    // Render Model Options
    const modelsList = [
        { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', desc: '(Recommended) High capability lightweight model' },
        { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', desc: 'Fast lightweight model' },
        { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', desc: 'Efficient multimodal model' }
    ];

    modelDropdown.innerHTML = modelsList.map(m => `
        <div class="model-option ${m.id === selectedModel ? 'selected' : ''}" data-id="${m.id}">
            <div class="model-option-name">${m.name}</div>
            <div class="model-option-desc">${m.desc}</div>
        </div>
    `).join('');

    modelDropdown.querySelectorAll('.model-option').forEach(opt => {
        opt.addEventListener('click', () => {
            selectedModel = opt.dataset.id;
            localStorage.setItem('mini_gpt_model', selectedModel);
            updateCurrentModelLabel(selectedModel);
            modelSelect.value = selectedModel;
            modelDropdown.classList.remove('show');
        });
    });

    // Settings Modal
    openSettingsBtn.addEventListener('click', () => settingsModal.classList.add('show'));
    closeSettingsModalBtn.addEventListener('click', () => settingsModal.classList.remove('show'));
    cancelSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('show'));

    temperatureSlider.addEventListener('input', (e) => tempVal.textContent = e.target.value);

    saveSettingsBtn.addEventListener('click', () => {
        selectedModel = modelSelect.value;
        temperature = parseFloat(temperatureSlider.value);

        localStorage.setItem('mini_gpt_model', selectedModel);
        localStorage.setItem('mini_gpt_temp', temperature);

        updateCurrentModelLabel(selectedModel);
        checkBackendStatus();
        settingsModal.classList.remove('show');
    });

    // Persona Modal
    personaBtn.addEventListener('click', () => personaModal.classList.add('show'));
    closePersonaModalBtn.addEventListener('click', () => personaModal.classList.remove('show'));

    chipBtns.forEach(chip => {
        chip.addEventListener('click', () => {
            chipBtns.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            systemInstructionInput.value = chip.dataset.sys;
        });
    });

    clearPersonaBtn.addEventListener('click', () => {
        systemInstructionInput.value = '';
        chipBtns.forEach(c => c.classList.remove('active'));
    });

    savePersonaBtn.addEventListener('click', () => {
        systemInstruction = systemInstructionInput.value.trim();
        localStorage.setItem('mini_gpt_persona', systemInstruction);
        personaModal.classList.remove('show');
    });

    // Utility HTML Escaper
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // --- CAMERA SNAP OPTION ---
    let cameraStream = null;
    let cameraFacingMode = 'environment'; // Default to main/rear camera on mobile phones
    const switchCameraBtn = document.getElementById('switchCameraBtn');
    const nativeCameraBtn = document.getElementById('nativeCameraBtn');
    const nativeCameraInput = document.getElementById('nativeCameraInput');

    async function startCamera(facingMode = 'environment') {
        stopCameraTracksOnly();
        cameraFacingMode = facingMode;
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: facingMode } },
                audio: false
            });
            cameraVideo.srcObject = cameraStream;
            cameraModal.classList.add('show');
        } catch (err) {
            console.error("Camera access failed:", err);
            try {
                cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                cameraVideo.srcObject = cameraStream;
                cameraModal.classList.add('show');
            } catch (err2) {
                alert("Could not access camera. Please check browser permissions.");
            }
        }
    }

    function stopCameraTracksOnly() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        cameraVideo.srcObject = null;
    }

    function stopCamera() {
        stopCameraTracksOnly();
        cameraModal.classList.remove('show');
    }

    if (switchCameraBtn) {
        switchCameraBtn.addEventListener('click', () => {
            const nextMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
            startCamera(nextMode);
        });
    }

    if (nativeCameraBtn && nativeCameraInput) {
        nativeCameraBtn.addEventListener('click', () => {
            stopCamera();
            nativeCameraInput.click();
        });

        nativeCameraInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                const base64Data = evt.target.result.split(',')[1];
                currentAttachment = {
                    name: file.name || `photo_${Date.now()}.jpg`,
                    mime_type: file.type || 'image/jpeg',
                    data: base64Data
                };

                filePreviewName.textContent = currentAttachment.name;
                filePreviewThumb.src = evt.target.result;
                filePreviewThumb.style.display = 'block';
                filePreviewBar.style.display = 'block';
                updateInputDisplay();
            };
            reader.readAsDataURL(file);
        });
    }

    if (cameraBtn) {
        cameraBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (attachmentMenu) {
                attachmentMenu.classList.remove('show');
                addBtnIcon.style.transform = 'none';
            }
            // Directly trigger mobile device camera app
            if (nativeCameraInput) {
                nativeCameraInput.click();
            } else {
                startCamera('environment');
            }
        });
    }
    if (closeCameraModalBtn) closeCameraModalBtn.addEventListener('click', stopCamera);
    if (cancelCameraBtn) cancelCameraBtn.addEventListener('click', stopCamera);

    if (capturePhotoBtn) {
        capturePhotoBtn.addEventListener('click', () => {
            if (!cameraStream) return;

            cameraCanvas.width = cameraVideo.videoWidth || 640;
            cameraCanvas.height = cameraVideo.videoHeight || 480;

            const ctx = cameraCanvas.getContext('2d');

            // Mirror canvas drawing only for front ('user') camera
            if (cameraFacingMode === 'user') {
                ctx.translate(cameraCanvas.width, 0);
                ctx.scale(-1, 1);
            }
            ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);

            const base64Data = cameraCanvas.toDataURL('image/jpeg').split(',')[1];

            currentAttachment = {
                name: `snapshot_${Date.now()}.jpg`,
                mime_type: 'image/jpeg',
                data: base64Data
            };

            filePreviewName.textContent = currentAttachment.name;
            filePreviewThumb.src = `data:image/jpeg;base64,${base64Data}`;
            filePreviewThumb.style.display = 'block';
            filePreviewBar.style.display = 'block';

            updateInputDisplay();
            stopCamera();
        });
    }

    // --- MICROPHONE VOICE TYPING ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let isListening = false;
    let baseText = '';

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            if (!isListening) return;

            let finalSegments = [];
            let interimSegments = [];

            // Rebuild speech segments dynamically to insert spaces and strip default periods (.)
            for (let i = 0; i < event.results.length; ++i) {
                const alt = event.results[i] && event.results[i][0];
                const rawText = (alt && alt.transcript) ? alt.transcript : '';
                const cleanedText = rawText.trim().replace(/\.$/, "").trim(); // Strip trailing period safely

                if (event.results[i].isFinal) {
                    if (cleanedText) finalSegments.push(cleanedText);
                } else {
                    if (cleanedText) interimSegments.push(cleanedText);
                }
            }

            const finalTranscript = finalSegments.join(' ');
            const interimTranscript = interimSegments.join(' ');

            // Build text output dynamically with proper sentence spacing
            let output = baseText;
            if (finalTranscript) {
                output += (output ? ' ' : '') + finalTranscript;
            }
            if (interimTranscript) {
                output += (output ? ' ' : '') + interimTranscript;
            }

            userInput.value = output;

            // Auto resize input textarea
            userInput.dispatchEvent(new Event('input'));
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            stopListening();
        };

        recognition.onend = () => {
            stopListening();
        };
    }

    function startListening() {
        if (!recognition) return;
        try {
            baseText = userInput.value; // Store text currently in the box
            recognition.start();
            isListening = true;
            micBtn.classList.add('recording');
            micBtn.title = "Stop Listening";
        } catch (err) {
            console.error("Failed to start speech recognition:", err);
        }
    }

    function stopListening() {
        if (!recognition) return;
        try {
            recognition.stop();
        } catch (err) { }
        isListening = false;
        micBtn.classList.remove('recording');
        micBtn.title = "Voice Typing";
    }

    function abortListening() {
        if (!recognition) return;
        try {
            recognition.abort(); // Immediately cut off the recording session
        } catch (err) { }
        isListening = false;
        micBtn.classList.remove('recording');
        micBtn.title = "Voice Typing";
    }

    if (micBtn) {
        micBtn.addEventListener('click', () => {
            if (!recognition) {
                alert("Speech recognition is not supported in this browser. Please try Chrome, Edge, or Safari.");
                return;
            }
            if (isListening) {
                abortListening(); // Stop instantly
            } else {
                startListening();
            }
        });
    }

    // ==========================================================================
    // FIREBASE AUTHENTICATION LOGIC & HANDLERS
    // ==========================================================================
    function handleAuthStateChanged(user) {
        const authOverlay = document.getElementById('authOverlay');
        const userNameEl = document.getElementById('userName');
        const userEmailEl = document.getElementById('userEmail');
        const userAvatarImg = document.getElementById('userAvatarImg');
        const userAvatarInitial = document.getElementById('userAvatarInitial');
        const logoutBtn = document.getElementById('logoutBtn');
        const authError = document.getElementById('authError');

        if (authError) {
            authError.style.display = 'none';
            authError.textContent = '';
        }

        if (user) {
            currentUser = user;
            if (authOverlay) authOverlay.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'flex';

            // Set user profile info
            const displayName = user.displayName || (user.isAnonymous ? 'Guest User' : user.email.split('@')[0]);
            if (userNameEl) userNameEl.textContent = displayName;

            if (user.email && !user.isAnonymous) {
                if (userEmailEl) {
                    userEmailEl.textContent = user.email;
                    userEmailEl.style.display = 'block';
                }
            } else {
                if (userEmailEl) userEmailEl.style.display = 'none';
            }

            if (user.photoURL) {
                if (userAvatarImg) {
                    userAvatarImg.src = user.photoURL;
                    userAvatarImg.style.display = 'block';
                }
                if (userAvatarInitial) userAvatarInitial.style.display = 'none';
            } else {
                if (userAvatarImg) userAvatarImg.style.display = 'none';
                if (userAvatarInitial) {
                    userAvatarInitial.style.display = 'block';
                    userAvatarInitial.textContent = user.isAnonymous ? 'G' : displayName.charAt(0).toUpperCase();
                }
            }

            // Load user-specific chat history
            loadUserChats(user);
        } else {
            currentUser = null;
            if (authOverlay) authOverlay.style.display = 'flex';
            if (logoutBtn) logoutBtn.style.display = 'none';

            if (userNameEl) userNameEl.textContent = 'Sign In';
            if (userEmailEl) userEmailEl.style.display = 'none';
            if (userAvatarImg) userAvatarImg.style.display = 'none';
            if (userAvatarInitial) {
                userAvatarInitial.style.display = 'block';
                userAvatarInitial.textContent = 'AI';
            }

            // Clear active chat viewport & history
            chats = [];
            currentChatId = null;
            if (messagesList) messagesList.innerHTML = '';
            if (welcomeContainer) welcomeContainer.style.display = 'block';
            if (messagesList) messagesList.style.display = 'none';
            renderHistory();
        }
    }

    function loadUserChats(user) {
        if (!user) return;
        const keys = getUserStorageKeys(user);
        const mergedMap = new Map();

        keys.forEach(key => {
            try {
                const stored = JSON.parse(localStorage.getItem(key) || '[]');
                stored.forEach(chat => {
                    if (chat && chat.id) {
                        const existing = mergedMap.get(chat.id);
                        const chatMsgs = chat.messages ? chat.messages.length : 0;
                        const existingMsgs = (existing && existing.messages) ? existing.messages.length : -1;
                        if (!existing || chatMsgs >= existingMsgs) {
                            mergedMap.set(chat.id, chat);
                        }
                    }
                });
            } catch (e) {
                console.error("Failed to parse stored chat for key:", key, e);
            }
        });

        chats = Array.from(mergedMap.values());
        chats.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        if (chats.length > 0) {
            saveChatsToStorage(); // persist merged chats back to all user keys
            renderHistory();
            selectChat(chats[0].id);
        } else {
            createNewChat();
        }
    }

    // Auth Form & View Switching Listeners
    const authViewSignIn = document.getElementById('authViewSignIn');
    const authViewSignUp = document.getElementById('authViewSignUp');
    const goToSignUp = document.getElementById('goToSignUp');
    const goToSignIn = document.getElementById('goToSignIn');

    const authEmailSignIn = document.getElementById('authEmailSignIn');
    const authPasswordSignIn = document.getElementById('authPasswordSignIn');
    const authEmailSignUp = document.getElementById('authEmailSignUp');
    const authPasswordSignUp = document.getElementById('authPasswordSignUp');

    const toggleSignInPwd = document.getElementById('toggleSignInPwd');
    const toggleSignUpPwd = document.getElementById('toggleSignUpPwd');

    const authSignInBtn = document.getElementById('authSignInBtn');
    const authSignUpBtn = document.getElementById('authSignUpBtn');

    const authGoogleBtnSignIn = document.getElementById('authGoogleBtnSignIn');
    const authGoogleBtnSignUp = document.getElementById('authGoogleBtnSignUp');

    const authError = document.getElementById('authError');

    function showAuthError(msg) {
        if (!authError) return;
        authError.textContent = msg;
        authError.style.display = 'block';
    }

    function clearAuthError() {
        if (authError) {
            authError.textContent = '';
            authError.style.display = 'none';
        }
    }

    // View Switchers
    if (goToSignUp) {
        goToSignUp.addEventListener('click', (e) => {
            e.preventDefault();
            clearAuthError();
            if (authViewSignIn) authViewSignIn.style.display = 'none';
            if (authViewSignUp) authViewSignUp.style.display = 'block';
        });
    }

    if (goToSignIn) {
        goToSignIn.addEventListener('click', (e) => {
            e.preventDefault();
            clearAuthError();
            if (authViewSignUp) authViewSignUp.style.display = 'none';
            if (authViewSignIn) authViewSignIn.style.display = 'block';
        });
    }

    // Password Eye Toggles
    function setupPasswordToggle(btn, inputEl) {
        if (!btn || !inputEl) return;
        btn.addEventListener('click', () => {
            const isPwd = inputEl.type === 'password';
            inputEl.type = isPwd ? 'text' : 'password';
            btn.style.color = isPwd ? 'var(--accent-primary)' : 'var(--text-muted)';
        });
    }
    setupPasswordToggle(toggleSignInPwd, authPasswordSignIn);
    setupPasswordToggle(toggleSignUpPwd, authPasswordSignUp);

    // Sign In Handler
    if (authSignInBtn) {
        authSignInBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = authEmailSignIn ? authEmailSignIn.value.trim() : '';
            const password = authPasswordSignIn ? authPasswordSignIn.value : '';

            if (!email || !password) {
                showAuthError('Please enter both your email address and password.');
                return;
            }
            clearAuthError();
            authSignInBtn.disabled = true;
            authSignInBtn.textContent = 'Signing In...';

            try {
                await authManager.signInWithEmail(email, password);
            } catch (err) {
                console.error('Sign In error:', err);
                showAuthError(err.message || 'Sign in failed. Please check your credentials.');
            } finally {
                authSignInBtn.disabled = false;
                authSignInBtn.textContent = 'Sign In';
            }
        });
    }

    // Sign Up Handler
    if (authSignUpBtn) {
        authSignUpBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = authEmailSignUp ? authEmailSignUp.value.trim() : '';
            const password = authPasswordSignUp ? authPasswordSignUp.value : '';

            if (!email || !password) {
                showAuthError('Please enter an email address and password.');
                return;
            }
            if (password.length < 6) {
                showAuthError('Password must be at least 6 characters long.');
                return;
            }
            clearAuthError();
            authSignUpBtn.disabled = true;
            authSignUpBtn.textContent = 'Registering...';

            try {
                await authManager.signUpWithEmail(email, password);
            } catch (err) {
                console.error('Sign Up error:', err);
                showAuthError(err.message || 'Registration failed. Please try again.');
            } finally {
                authSignUpBtn.disabled = false;
                authSignUpBtn.textContent = 'Sign Up';
            }
        });
    }

    // Google Sign In Handlers
    async function handleGoogleSignIn(btn) {
        if (!btn) return;
        btn.disabled = true;
        clearAuthError();
        try {
            await authManager.signInWithGoogle();
        } catch (err) {
            console.error('Google Auth error:', err);
            showAuthError(err.message || 'Failed to sign in with Google.');
        } finally {
            btn.disabled = false;
        }
    }

    if (authGoogleBtnSignIn) {
        authGoogleBtnSignIn.addEventListener('click', () => handleGoogleSignIn(authGoogleBtnSignIn));
    }
    if (authGoogleBtnSignUp) {
        authGoogleBtnSignUp.addEventListener('click', () => handleGoogleSignIn(authGoogleBtnSignUp));
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await authManager.signOut();
            } catch (err) {
                console.error('Sign out error:', err);
            }
        });
    }

    // Start App
    init();
});
