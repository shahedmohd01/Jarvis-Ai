document.addEventListener('DOMContentLoaded', () => {
    // State Variables
    let chats = JSON.parse(localStorage.getItem('mini_gpt_chats') || '[]');
    let currentChatId = null;
    let selectedModel = localStorage.getItem('mini_gpt_model') || 'gemini-3.6-flash';
    let apiKey = localStorage.getItem('mini_gpt_api_key') || '';
    let temperature = parseFloat(localStorage.getItem('mini_gpt_temp') || '0.7');
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

    // Initialize Marked & Highlight.js
    if (window.marked) {
        marked.setOptions({
            gfm: true,
            breaks: true,
            highlight: function(code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (err) {}
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
        apiKeyInput.value = apiKey;
        modelSelect.value = selectedModel;
        temperatureSlider.value = temperature;
        tempVal.textContent = temperature;
        systemInstructionInput.value = systemInstruction;
        updateCurrentModelLabel(selectedModel);

        // Check Backend Health & API Key Status
        checkBackendStatus();

        // Render History List
        renderHistory();

        // Create or Load Active Chat
        if (chats.length > 0) {
            selectChat(chats[0].id);
        } else {
            createNewChat();
        }
    }

    // Dynamic API URL Resolver
    function getApiUrl(path) {
        if (window.location.protocol === 'file:') {
            return `http://127.0.0.1:8000${path}`;
        }
        if (window.location.port && window.location.port !== '8000') {
            const host = window.location.hostname || '127.0.0.1';
            return `http://${host}:8000${path}`;
        }
        return path;
    }

    async function checkBackendStatus() {
        try {
            const headers = {};
            if (apiKey) headers['x-gemini-api-key'] = apiKey;
            const res = await fetch(getApiUrl('/api/health'), { headers });
            const data = await res.json();
            
            if (data.api_key_configured) {
                apiStatusText.textContent = 'API Ready';
                apiStatusText.style.color = '#10b981';
            } else {
                apiStatusText.textContent = 'Key Required';
                apiStatusText.style.color = '#f59e0b';
            }
        } catch (e) {
            apiStatusText.textContent = 'Offline';
            apiStatusText.style.color = '#ef4444';
        }
    }

    function updateCurrentModelLabel(modelId) {
        const names = {
            'gemini-3.6-flash': 'Gemini 3.6 Flash',
            'gemini-3.5-flash': 'Gemini 3.5 Flash',
            'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
            'gemini-flash-latest': 'Gemini 3.6 Flash',
            'gemini-pro-latest': 'Gemini 3.6 Flash',
            'gemini-2.0-flash': 'Gemini 3.6 Flash',
            'gemini-2.5-flash': 'Gemini 3.6 Flash',
            'gemini-2.5-pro': 'Gemini 3.6 Flash',
            'gemini-1.5-flash': 'Gemini 3.6 Flash',
            'gemini-1.5-pro': 'Gemini 3.6 Flash'
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

    function saveChatsToStorage() {
        localStorage.setItem('mini_gpt_chats', JSON.stringify(chats));
    }

    // --- MESSAGES RENDERING ---
    function renderMessages(messages) {
        messagesList.innerHTML = '';
        messages.forEach(msg => {
            appendMessageUI(msg.role, msg.content, msg.image, false);
        });
        scrollToBottom();
    }

    function appendMessageUI(role, content, image = null, isStreaming = false) {
        const isUser = role === 'user';
        const row = document.createElement('div');
        row.className = `message-row ${isUser ? 'user-row' : 'ai-row'}`;

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

        row.innerHTML = `
            ${avatarHtml}
            <div class="message-content-wrapper">
                ${bodyHtml}
            </div>
        `;

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

    // --- SEND MESSAGE & STREAMING ---
    async function sendMessage(textPrompt = null) {
        const text = textPrompt || userInput.value.trim();
        if ((!text && !currentAttachment) || isGenerating) return;

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

        // Append User UI
        appendMessageUI('user', text, userMsg.image);

        // Reset Input Bar & Preview
        userInput.value = '';
        userInput.style.height = 'auto';
        clearAttachment();

        // Prepare Assistant Streaming UI
        isGenerating = true;
        setGeneratingState(true);

        const aiRow = appendMessageUI('model', '', null, true);
        const bubble = aiRow.querySelector('.message-bubble');

        let fullAiText = '';

        try {
            abortController = new AbortController();

            const payload = {
                messages: activeChat.messages,
                model: selectedModel,
                temperature: temperature,
                system_instruction: systemInstruction,
                api_key: apiKey
            };

            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) headers['x-gemini-api-key'] = apiKey;

            const response = await fetch(getApiUrl('/api/chat/stream'), {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload),
                signal: abortController.signal
            });

            if (!response.ok) {
                const errJson = await response.json().catch(() => ({ detail: response.statusText }));
                throw new Error(errJson.detail || 'Failed to stream response');
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
                            }
                        }
                    }
                }
            }

            // Streaming finished cleanly
            activeChat.messages.push({ role: 'model', content: fullAiText });
            saveChatsToStorage();

        } catch (err) {
            if (err.name === 'AbortError') {
                fullAiText += ' *(Response stopped by user)*';
            } else {
                let msg = err.message || 'Unknown error';
                if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
                    msg = 'Failed to connect to backend server (http://127.0.0.1:8000). Please make sure `python run.py` is running.';
                }
                fullAiText += `\n\n**Error**: ${msg}`;
            }
            bubble.innerHTML = window.marked ? marked.parse(fullAiText) : escapeHtml(fullAiText);
            activeChat.messages.push({ role: 'model', content: fullAiText });
            saveChatsToStorage();
        } finally {
            isGenerating = false;
            setGeneratingState(false);
            abortController = null;
        }
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

    // --- FILE ATTACHMENTS ---
    attachBtn.addEventListener('click', () => fileInput.click());

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
            if (file.type.startsWith('image/')) {
                filePreviewThumb.src = evt.target.result;
                filePreviewThumb.style.display = 'block';
            } else {
                filePreviewThumb.style.display = 'none';
            }
            filePreviewBar.style.display = 'block';
        };
        reader.readAsDataURL(file);
    });

    removeFileBtn.addEventListener('click', clearAttachment);

    function clearAttachment() {
        currentAttachment = null;
        fileInput.value = '';
        filePreviewBar.style.display = 'none';
    }

    // --- EVENT LISTENERS ---
    
    // Auto Resize Input Textarea
    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = Math.min(userInput.scrollHeight, 180) + 'px';
    });

    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

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
    openSidebarBtn.addEventListener('click', () => sidebar.classList.add('open'));
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
        { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', desc: 'Fastest & highly intelligent' },
        { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', desc: 'High capability model' },
        { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', desc: 'Lightweight & instant' }
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

    togglePasswordBtn.addEventListener('click', () => {
        const type = apiKeyInput.getAttribute('type');
        apiKeyInput.setAttribute('type', type === 'password' ? 'text' : 'password');
        togglePasswordBtn.textContent = type === 'password' ? 'Hide' : 'Show';
    });

    temperatureSlider.addEventListener('input', (e) => tempVal.textContent = e.target.value);

    saveSettingsBtn.addEventListener('click', () => {
        apiKey = apiKeyInput.value.trim();
        selectedModel = modelSelect.value;
        temperature = parseFloat(temperatureSlider.value);

        localStorage.setItem('mini_gpt_api_key', apiKey);
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

    // Start App
    init();
});
