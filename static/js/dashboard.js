// Show the user's name in the top right corner
window.addEventListener('DOMContentLoaded', function() {
    const userName = window.localStorage.getItem('userName');
    const usernameSpan = document.getElementById('usernamecorner');
    if (usernameSpan) {
        usernameSpan.textContent = userName ? userName : 'Guest';
    }
    // Add event listener for logout button
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
    // Add event listener for new chat button
    const newChatButton = document.getElementById('new-chat-button');
    if (newChatButton) {
        newChatButton.addEventListener('click', startNewChat);
    }
    // Add event listener for clear history button
    const clearHistoryButton = document.getElementById('clear-history-button');
    if (clearHistoryButton) {
        clearHistoryButton.addEventListener('click', clearHistory);
    }
    
    // Auth Check: Redirect if not logged in
    const userId = window.localStorage.getItem('userId');
    if (!userId) {
        window.location.href = 'index.html?msg=login_required';
        return;
    }

    //load chat history
    loadChatHistory();
});

let chatHistory = [];
let currentConversationId = null;
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const chatHistoryDiv = document.getElementById('chat-history');

// Function to show the custom action modal (Rename/Delete)
function showActionModal(config) {
    const modal = document.getElementById('custom-action-modal');
    const title = document.getElementById('action-modal-title');
    const desc = document.getElementById('action-modal-desc');
    const inputWrap = document.getElementById('action-modal-input-wrap');
    const input = document.getElementById('action-modal-input');
    const confirmBtn = document.getElementById('action-modal-confirm');
    const cancelBtn = document.getElementById('action-modal-cancel');

    title.textContent = config.title;
    desc.textContent = config.desc;
    
    if (config.showInput) {
        inputWrap.style.display = 'block';
        input.value = config.inputValue || '';
        setTimeout(() => input.focus(), 100);
    } else {
        inputWrap.style.display = 'none';
    }

    if (config.isDanger) confirmBtn.classList.add('danger');
    else confirmBtn.classList.remove('danger');

    modal.classList.add('show');

    return new Promise((resolve) => {
        const handleConfirm = () => {
            const val = config.showInput ? input.value.trim() : true;
            if (config.showInput && !val) {
                input.style.borderColor = 'red';
                return;
            }
            cleanup();
            resolve(val);
        };
        const handleCancel = () => { cleanup(); resolve(null); };
        const cleanup = () => {
            modal.classList.remove('show');
            input.style.borderColor = '#334155';
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
    });
}

// Util to add a message to the chat UI
function addMessageToChat(content, isUser) {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let displayContent = isUser ? content : marked.parse(content);

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + (isUser ? 'user' : 'bot');
    messageDiv.innerHTML = `
        <div class="message-content">
            <div class="text-body">${displayContent}</div>
            <div class="message-time">${timeString}</div>
        </div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Send to Gemini via backend, including user_id!
async function getGeminiResponse(userPrompt, historyArr) {
    const userId = window.localStorage.getItem('userId');
    if (!userId) {
        // Optionally show a message or force reload or logout
        return { error: "You are not logged in. Please log in again!" };
    }

    try {
        const response = await fetch('http://127.0.0.1:5000/ask-gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: userPrompt,
                user_id: userId,  // <-- KEY LINE! Always send this.
                conversation_id: currentConversationId, // Ensure we thread the chat!
                history: historyArr.filter(msg => msg.content && msg.content.trim()).map(msg => ({
                    role: msg.isUser ? "user" : "bot",
                    content: msg.content
                }))
            })
        });
        const data = await response.json();
        return data; // Return full data object including conversation_id
    } catch (e) {
        return { error: "Sorry, something went wrong connecting to Gemini!" };
    }
}

async function handleSend() {
    const userMsg = userInput.value.trim();
    if (!userMsg) return;
    
    const chatHeader = document.getElementById('chat-header');
    if (chatHeader) chatHeader.style.display = 'none';
    
    addMessageToChat(userMsg, true);
    chatHistory.push({content: userMsg, isUser: true});
    userInput.value = '';
    userInput.focus();
    // Add "bot is typing..." indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot';
    typingDiv.innerHTML = `<div class="message-content" style="color: #6c757d;"><i class="fas fa-ellipsis-h"></i></div>`;
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Get Gemini response
    const replyData = await getGeminiResponse(userMsg, chatHistory);
    chatMessages.removeChild(typingDiv);
    
    // Process updated response format
    const replyCount = replyData.response || replyData.reply || replyData.error || "Sorry, I couldn't get an answer from Gemini right now.";
    if (replyCount) {
        addMessageToChat(replyCount, false);
        chatHistory.push({content: replyCount, isUser: false});
        
        if (replyData.conversation_id && !currentConversationId) {
            currentConversationId = replyData.conversation_id;
        }
        
        // Refresh sidebar on every main message exchange to keep it updated (title/last active)
        loadChatHistory();
    }
}

// Logout function
async function handleLogout() {
    try {
        // Call backend logout endpoint
        const response = await fetch('http://127.0.0.1:5000/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (response.ok) {
            // Clear localStorage
            window.localStorage.removeItem('userName');
            window.localStorage.removeItem('userId');
            // Redirect to homepage with logout message
            window.location.href = 'index.html?msg=logout';
        } else {
            console.error('Logout failed:', data.error);
            // Still redirect to homepage for safety
            window.location.href = 'index.html?msg=logout';
        }
    } catch (e) {
        console.error('Error during logout:', e);
        // Clear localStorage and redirect even if backend call fails
        window.localStorage.removeItem('userName');
        window.localStorage.removeItem('userId');
        window.location.href = 'index.html?msg=logout';
    }
}

// Start a new chat
function startNewChat() {
    chatMessages.innerHTML = '';
    chatHistory = [];
    currentConversationId = null;
    const chatHeader = document.getElementById('chat-header');
    if (chatHeader) chatHeader.style.display = 'block';
    userInput.focus();
}

// Clear entire chat history
async function clearHistory() {
    const result = await showActionModal({
        title: 'Clear All History',
        desc: 'Are you sure you want to delete all chat history? This action cannot be undone.',
        isDanger: true
    });

    if (result) {
        const userId = window.localStorage.getItem('userId');
        if (userId) {
            try {
                await fetch(`http://127.0.0.1:5000/chat-history/${userId}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });
                chatHistoryDiv.innerHTML = '';
                chatMessages.innerHTML = '';
                chatHistory = [];
                currentConversationId = null;
                const chatHeader = document.getElementById('chat-header');
                if (chatHeader) chatHeader.style.display = 'block';
            } catch (e) {
                console.error('Error clearing history:', e);
            }
        }
    }
}

// Load chat history
async function loadChatHistory() {
    const userId = window.localStorage.getItem('userId');
    if (!userId) return;

    try {
        const response = await fetch(`http://127.0.0.1:5000/chat-history/${userId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        chatHistoryDiv.innerHTML = '';
        
        // Data is now { conv_id: { messages: [], custom_title: "" } }
        const entries = Object.entries(data).reverse(); // Most recent first
        
        for (const [convId, convData] of entries) {
            const messages = convData.messages || [];
            const customTitle = convData.custom_title;
            
            // Find the VERY FIRST user message to use as the title
            const userMessages = messages.filter(msg => msg.role === 'user');
            const firstUserText = userMessages.length > 0 ? userMessages[0].text : "";
            
            // Priority: User's Custom Rename > User's 1st Message > "Untitled Chat"
            let fullTitle = customTitle || firstUserText || "Untitled Chat";
            let displayTitle = fullTitle;
            if (displayTitle.length > 25) displayTitle = displayTitle.substring(0, 25) + "...";
            
            const lastMsgStr = messages[messages.length - 1]?.text || "";
            const preview = lastMsgStr ? (lastMsgStr.substring(0, 35) + (lastMsgStr.length > 35 ? "..." : "")) : "No messages";
            const rawDate = messages[0]?.timestamp || "";
            const dateStr = rawDate ? new Date(rawDate).toLocaleDateString([], {month: 'short', day: 'numeric'}) : "Unknown";

            const item = document.createElement('div');
            item.className = 'chat-history-item';
            item.title = fullTitle; /* Tooltip for full title on hover */
            if (currentConversationId === convId) item.classList.add('active');
            
            item.innerHTML = `
                <div class="title">${displayTitle}</div>
                <div class="preview">${preview}</div>
                <div class="item-footer">
                    <div class="timestamp">${dateStr}</div>
                </div>
                <div class="menu-btn"><i class="fas fa-ellipsis-v"></i></div>
                <div class="options-menu">
                    <div class="menu-item-action rename"><i class="fas fa-edit"></i> Rename</div>
                    <div class="menu-item-action delete"><i class="fas fa-trash"></i> Delete</div>
                </div>
            `;
            item.dataset.conversationId = convId;
            
            // Toggle menu
            const menuBtn = item.querySelector('.menu-btn');
            const optionsMenu = item.querySelector('.options-menu');
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.options-menu').forEach(m => {
                    if (m !== optionsMenu) m.classList.remove('show');
                });
                optionsMenu.classList.toggle('show');
            });

            // Action: Rename
            item.querySelector('.rename').addEventListener('click', (e) => {
                e.stopPropagation();
                optionsMenu.classList.remove('show');
                renameConversation(convId, title);
            });

            // Action: Delete
            item.querySelector('.delete').addEventListener('click', (e) => {
                e.stopPropagation();
                optionsMenu.classList.remove('show');
                deleteConversation(convId);
            });

            item.addEventListener('click', () => loadConversation(convId));
            chatHistoryDiv.appendChild(item);
        }
    } catch (e) {
        console.error('Error loading chat history:', e);
    }
}

// Rename a conversation
async function renameConversation(convId, currentTitle) {
    const newTitle = await showActionModal({
        title: 'Rename Chat',
        desc: 'Enter a new custom title for this conversation:',
        showInput: true,
        inputValue: currentTitle
    });

    if (newTitle && newTitle !== currentTitle) {
        try {
            const response = await fetch(`http://127.0.0.1:5000/rename-conversation/${convId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });
            const data = await response.json();
            if (data.message) {
                loadChatHistory(); // Refresh
            }
        } catch (e) {
            console.error('Error renaming conversation:', e);
        }
    }
}

// Close menus when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.options-menu').forEach(m => m.classList.remove('show'));
});

// Delete a specific conversation
async function deleteConversation(convId) {
    const result = await showActionModal({
        title: 'Delete Chat',
        desc: 'Are you sure you want to delete this conversation? This will remove all messages permanently.',
        isDanger: true
    });

    if (result) {
        const userId = window.localStorage.getItem('userId');
        if (userId) {
            try {
                await fetch(`http://127.0.0.1:5000/chat-history/${userId}/${convId}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (currentConversationId === convId) {
                    chatMessages.innerHTML = '';
                    chatHistory = [];
                    currentConversationId = null;
                }
                loadChatHistory(); // Reload to reflect changes
            } catch (e) {
                console.error('Error deleting conversation:', e);
            }
        }
    }
}

// Load a specific conversation
async function loadConversation(conversationId) {
    currentConversationId = conversationId;
    const userId = window.localStorage.getItem('userId');
    if (!userId) return;
    try {
        const response = await fetch(`http://127.0.0.1:5000/chat-history/${userId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        chatMessages.innerHTML = '';
        const convData = data[conversationId] || {};
        const messages = convData.messages || [];
        
        messages.forEach(msg => {
            addMessageToChat(msg.text, msg.role === 'user');
        });
        chatHistory = messages.map(msg => ({ content: msg.text, isUser: msg.role === 'user' }));
        
        const chatHeader = document.getElementById('chat-header');
        if (chatHeader) {
            chatHeader.style.display = messages.length > 0 ? 'none' : 'block';
        }
        
        // Mark active in sidebar
        document.querySelectorAll('.chat-history-item').forEach(el => {
            el.classList.toggle('active', el.dataset.conversationId === conversationId);
        });
    } catch (e) {
        console.error('Error loading conversation:', e);
    }
}

sendButton.addEventListener('click', handleSend);
userInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') handleSend();
});

// Sidebar menu active highlighting (optional)
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', function() {
        document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
    });
});
