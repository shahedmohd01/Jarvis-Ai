import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInAnonymously, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================================================
// FIREBASE CLIENT CONFIGURATION
// ==========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyDnjcsDE6uOTnsdJWvZP_QYdEQ6bkkOXK4",
    authDomain: "jarvis-ai-713ff.firebaseapp.com",
    projectId: "jarvis-ai-713ff",
    storageBucket: "jarvis-ai-713ff.firebasestorage.app",
    messagingSenderId: "194615172927",
    appId: "1:194615172927:web:c47cfd4ee00b72998dfd8a",
    measurementId: "G-RQ2WN5S6V8"
};

let auth;
let db;
try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Firebase initialization failed:", e);
}

// Unified Auth Interface
const authManager = {
    onAuthStateChanged(callback) {
        return onAuthStateChanged(auth, callback);
    },
    async signInAnonymously() {
        return signInAnonymously(auth);
    },
    async signInWithGoogle() {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return signInWithPopup(auth, provider);
    },
    async signInWithEmail(email, password) {
        return signInWithEmailAndPassword(auth, email, password);
    },
    async signUpWithEmail(email, password) {
        return createUserWithEmailAndPassword(auth, email, password);
    },
    async signOut() {
        return signOut(auth);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // State Variables
    let chats = [];
    let currentUser = null;
    let currentChatId = null;
    let selectedModel = localStorage.getItem('mini_gpt_model') || 'gemini-3.5-flash-lite';
    let temperature = parseFloat(localStorage.getItem('mini_gpt_temp') || '0.2');
    let systemInstruction = localStorage.getItem('mini_gpt_persona') || '';
    let currentAttachment = null;
    let isGenerating = false;
    let abortController = null;

    // DOM Elements
    const sidebar = document.getElementById('sidebar');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
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

    // Dynamic API URL Resolver
    const RENDER_BACKEND_URL = 'https://jarvis-ai-backend-8ndm.onrender.com';

    function getApiUrl(path) {
        if (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return `http://127.0.0.1:8000${path}`;
        }
        return `${RENDER_BACKEND_URL}${path}`;
    }

    function init() {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('mini_gpt_theme', 'dark');

        if (modelSelect) modelSelect.value = selectedModel;
        if (temperatureSlider) temperatureSlider.value = temperature;
        if (tempVal) tempVal.textContent = temperature;
        if (systemInstructionInput) systemInstructionInput.value = systemInstruction;
        updateCurrentModelLabel(selectedModel);

        checkBackendStatus();
        setInterval(checkBackendStatus, 30000);

        authManager.onAuthStateChanged((user) => {
            handleAuthStateChanged(user);
        });

        updateInputDisplay();
    }

    async function checkBackendStatus() {
        const settingsBadge = document.getElementById('backendStatusLabel');
        const settingsBadgeWrap = document.getElementById('backendStatusBadge');
        try {
            const res = await fetch(getApiUrl('/api/health'), { signal: AbortSignal.timeout(5000) });
            if (res.ok) {
                if (statusBadge) {
                    statusBadge.classList.remove('offline', 'generating');
                    statusBadge.classList.add('online');
                }
                if (apiStatusText) {
                    apiStatusText.textContent = 'Online';
                    apiStatusText.style.color = '#10b981';
                }
                if (settingsBadge) settingsBadge.textContent = '✓ Connected to AI Backend (Online)';
                if (settingsBadgeWrap) settingsBadgeWrap.style.color = '#10b981';
            } else {
                setOfflineState(settingsBadge, settingsBadgeWrap);
            }
        } catch (e) {
            setOfflineState(settingsBadge, settingsBadgeWrap);
        }
    }

    function setOfflineState(settingsBadge, settingsBadgeWrap) {
        if (statusBadge) {
            statusBadge.classList.remove('online', 'generating');
            statusBadge.classList.add('offline');
        }
        if (apiStatusText) {
            apiStatusText.textContent = 'Offline';
            apiStatusText.style.color = '#ef4444';
        }
        if (settingsBadge) settingsBadge.textContent = '✗ Backend offline — try again later';
        if (settingsBadgeWrap) settingsBadgeWrap.style.color = '#ef4444';
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
        if (currentModelName) currentModelName.textContent = names[modelId] || modelId;
    }

    const WELCOME_GREETINGS = [
        "Hi There, Meet Jarvis AI",
        "How can I help you today?",
        "What's on your mind today?",
        "What can I write, explain, or code today?",
        "Need help writing, coding, or brainstorming? Just ask!"
    ];

    function randomizeWelcomeMessage() {
        const welcomeTitle = document.querySelector('.welcome-title');
        if (!welcomeTitle) return;
        const randomIndex = Math.floor(Math.random() * WELCOME_GREETINGS.length);
        welcomeTitle.innerHTML = WELCOME_GREETINGS[randomIndex];
    }

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
        randomizeWelcomeMessage();
    }

    function selectChat(chatId) {
        currentChatId = chatId;
        const activeChat = chats.find(c => c.id === chatId);

        document.querySelectorAll('.history-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === chatId);
        });

        if (!activeChat || activeChat.messages.length === 0) {
            if (welcomeContainer) welcomeContainer.style.display = 'block';
            if (messagesList) {
                messagesList.style.display = 'none';
                messagesList.innerHTML = '';
            }
            randomizeWelcomeMessage();
        } else {
            if (welcomeContainer) welcomeContainer.style.display = 'none';
            if (messagesList) {
                messagesList.style.display = 'flex';
                renderMessages(activeChat.messages);
            }
        }
    }

    function renderHistory(filter = '') {
        if (!historyList) return;
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
                        closeMobileSidebar();
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

    async function syncChatsToCloud() {
        if (!currentUser) return;
        if (db) {
            try {
                const userDocRef = doc(db, "users", currentUser.uid);
                const validChats = chats.filter(c => c && c.id);
                await setDoc(userDocRef, { chats: validChats }, { merge: true });
            } catch (err) {
                console.error("Failed to sync chats to Firestore:", err);
            }
        }
    }

    function saveChatsToStorage() {
        if (!currentUser) return;
        const keys = getUserStorageKeys(currentUser);
        const validChats = chats.filter(c => c && c.id);
        const jsonStr = JSON.stringify(validChats);
        keys.forEach(key => localStorage.setItem(key, jsonStr));
        syncChatsToCloud();
    }

    function renderMessages(messages) {
        if (!messagesList) return;
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
            if (isStreaming && (!content || content.trim() === '')) {
                bodyHtml += `
                    <div class="message-bubble">
                        <div class="typing-indicator">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                `;
            } else {
                const parsedMarkdown = window.marked ? marked.parse(content || '') : escapeHtml(content);
                bodyHtml += `<div class="message-bubble">${parsedMarkdown}</div>`;
            }
        }

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

        const copyBtn = row.querySelector('.copy-msg-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(content).then(() => {
                    const originalSvg = copyBtn.innerHTML;
                    copyBtn.innerHTML = `✓`;
                    setTimeout(() => { copyBtn.innerHTML = originalSvg; }, 2000);
                });
            });
        }

        if (messagesList) messagesList.appendChild(row);

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
                <button class="copy-code-btn">Copy</button>
            `;

            header.querySelector('.copy-code-btn').addEventListener('click', () => {
                navigator.clipboard.writeText(codeEl.innerText).then(() => {
                    const btn = header.querySelector('.copy-code-btn');
                    btn.textContent = 'Copied!';
                    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
                });
            });

            pre.insertBefore(header, codeEl);
        });
    }

    function scrollToBottom() {
        if (chatViewport) chatViewport.scrollTop = chatViewport.scrollHeight;
    }

    function setGeneratingState(busy) {
        isGenerating = busy;
        if (!sendBtn) return;
        if (busy) {
            sendBtn.classList.add('generating-stop-btn');
            sendBtn.title = 'Stop Generating';
            sendBtn.innerHTML = `■`;
            if (inputBox) inputBox.classList.add('has-input');
            if (userInput) userInput.disabled = true;
            if (statusBadge) statusBadge.classList.add('generating');
            if (statusLabel) statusLabel.textContent = 'Jarvis is typing...';
        } else {
            sendBtn.classList.remove('generating-stop-btn');
            sendBtn.title = 'Send Message';
            sendBtn.innerHTML = `➤`;
            if (userInput) {
                userInput.disabled = false;
                userInput.focus();
            }
            if (statusBadge) statusBadge.classList.remove('generating');
            if (statusLabel) statusLabel.textContent = 'Ready';
            updateInputDisplay();
        }
    }

    async function sendMessage(textPrompt = null) {
        if (isGenerating) return;
        const text = textPrompt || userInput.value.trim();
        if (!text && !currentAttachment) return;

        const activeChat = chats.find(c => c.id === currentChatId);
        if (!activeChat) return;

        if (activeChat.messages.length === 0) {
            activeChat.title = text.slice(0, 30) + (text.length > 30 ? '...' : '');
            renderHistory();
        }

        const userMsg = {
            role: 'user',
            content: text,
            image: currentAttachment ? { mime_type: currentAttachment.mime_type, data: currentAttachment.data } : null
        };
        activeChat.messages.push(userMsg);
        saveChatsToStorage();

        if (welcomeContainer) welcomeContainer.style.display = 'none';
        if (messagesList) messagesList.style.display = 'flex';

        appendMessageUI('user', text, userMsg.image, false, activeChat.messages.length - 1);

        if (userInput) {
            userInput.value = '';
            userInput.style.height = 'auto';
        }
        clearAttachment();

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

            const clientTime = new Date();
            const dateStr = clientTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            const timeStr = clientTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

            const payload = {
                messages: activeChat.messages,
                model: selectedModel,
                temperature,
                system_instruction: systemInstruction,
                client_time: { date: dateStr, time: timeStr }
            };

            const response = await fetch(getApiUrl('/api/chat'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const jsonStr = line.slice(6).trim();
                    if (!jsonStr || jsonStr === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(jsonStr);
                        const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text || parsed.text;
                        if (chunk) {
                            fullAiText += chunk;
                            bubble.innerHTML = window.marked ? marked.parse(fullAiText) : escapeHtml(fullAiText);
                            enhanceCodeBlocks(aiRow);
                            scrollToBottom();
                        }
                    } catch (e) { }
                }
            }

            aiRow.remove();
            activeChat.messages.push({ role: 'model', content: fullAiText });
            saveChatsToStorage();
            appendMessageUI('model', fullAiText, null, false, activeChat.messages.length - 1);

        } catch (err) {
            aiRow.remove();
            let msg = err.name === 'AbortError' ? '*(Response stopped by user)*' : (err.message || 'Error communicating with AI service');
            activeChat.messages.push({ role: 'model', content: msg });
            saveChatsToStorage();
            appendMessageUI('model', msg, null, false, activeChat.messages.length - 1);
        } finally {
            isGenerating = false;
            setGeneratingState(false);
            abortController = null;
        }
    }

    function clearAttachment() {
        currentAttachment = null;
        if (fileInput) fileInput.value = '';
        if (filePreviewBar) filePreviewBar.style.display = 'none';
        updateInputDisplay();
    }

    function updateInputDisplay() {
        if (!inputBox || !userInput) return;
        if (userInput.value.trim() !== '' || currentAttachment !== null) {
            inputBox.classList.add('has-input');
        } else {
            inputBox.classList.remove('has-input');
        }
    }

    // --- EVENT LISTENERS ---
    if (userInput) {
        userInput.addEventListener('input', () => {
            userInput.style.height = 'auto';
            userInput.style.height = Math.min(userInput.scrollHeight, 180) + 'px';
            updateInputDisplay();
        });

        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            if (isGenerating && abortController) {
                abortController.abort();
            } else {
                sendMessage();
            }
        });
    }

    // Mobile Sidebar Drawer
    function closeMobileSidebar() {
        if (sidebar) sidebar.classList.remove('open');
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('show');
    }

    if (openSidebarBtn) {
        openSidebarBtn.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.toggle('open');
                if (sidebarBackdrop) sidebarBackdrop.classList.toggle('show');
            } else {
                sidebar.classList.toggle('collapsed');
            }
        });
    }

    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeMobileSidebar);
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeMobileSidebar);

    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            createNewChat();
            if (window.innerWidth <= 768) closeMobileSidebar();
        });
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // AUTH HANDLERS
    function handleAuthStateChanged(user) {
        const authOverlay = document.getElementById('authOverlay');
        const logoutBtn = document.getElementById('logoutBtn');
        const guestSignInBtn = document.getElementById('guestSignInBtn');
        const googleSignInBtn = document.getElementById('googleSignInBtn');

        if (user) {
            currentUser = user;
            if (authOverlay) authOverlay.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'flex';
            loadUserChats(user);
        } else {
            currentUser = null;
            if (authOverlay) authOverlay.style.display = 'flex';
            if (logoutBtn) logoutBtn.style.display = 'none';
            chats = [];
            currentChatId = null;
            if (messagesList) messagesList.innerHTML = '';
            if (welcomeContainer) welcomeContainer.style.display = 'block';
            renderHistory();
        }
    }

    async function loadUserChats(user) {
        if (!user) return;
        const keys = getUserStorageKeys(user);
        const mergedMap = new Map();

        keys.forEach(key => {
            try {
                const stored = JSON.parse(localStorage.getItem(key) || '[]');
                stored.forEach(chat => {
                    if (chat && chat.id) mergedMap.set(chat.id, chat);
                });
            } catch (e) { }
        });

        chats = Array.from(mergedMap.values());
        chats.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        if (chats.length > 0) {
            renderHistory();
            selectChat(chats[0].id);
        } else {
            createNewChat();
        }
    }

    // Attach Authentication Click Listeners
    document.getElementById('authGoogleBtnSignIn')?.addEventListener('click', () => authManager.signInWithGoogle());
    document.getElementById('guestSignInBtn')?.addEventListener('click', () => authManager.signInAnonymously());
    document.getElementById('logoutBtn')?.addEventListener('click', () => authManager.signOut());

    init();
});