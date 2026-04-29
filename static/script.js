async function askSuperTA(courseId, question) {
    const messagesDiv = document.getElementById(`${courseId}-chat-messages`);
    if (!messagesDiv) return null;

    const userMsg = document.createElement('div');
    userMsg.className = 'message user';
    userMsg.innerHTML = `<strong>You:</strong> ${escapeHtml(question)}`;
    messagesDiv.appendChild(userMsg);

    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'message bot';
    loadingMsg.innerHTML = `<strong>SuperTA:</strong> Thinking...`;
    messagesDiv.appendChild(loadingMsg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, course_id: courseId }),
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Request failed');
        }

        const data = await res.json();
        messagesDiv.removeChild(loadingMsg);

        const botMsg = document.createElement('div');
        botMsg.className = 'message bot';
        const badge = data.approved ? '<span class="teacher-approved">✓ Teacher Approved</span>' : '';

        let sourceHtml = '';
        if (data.source_type === 'web') {
            sourceHtml = `<div class="citation web-source">🌐 Online Source: ${escapeHtml(data.citation)}</div>`;
        } else if (data.source_type === 'pdf') {
            sourceHtml = `<div class="citation">📖 Source: ${escapeHtml(data.citation)}</div>`;
        } else {
            sourceHtml = `<div class="citation">📝 ${escapeHtml(data.citation)}</div>`;
        }

        botMsg.innerHTML = `
            <strong>SuperTA:</strong> ${escapeHtml(data.answer)}
            ${badge}
            ${sourceHtml}
        `;
        messagesDiv.appendChild(botMsg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise([botMsg]).catch(err => console.warn('MathJax render error:', err));
        }

        return data;
    } catch (err) {
        messagesDiv.removeChild(loadingMsg);
        const errMsg = document.createElement('div');
        errMsg.className = 'message bot';
        errMsg.innerHTML = `<strong>SuperTA:</strong> Sorry, I encountered an error. Please try again.`;
        messagesDiv.appendChild(errMsg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        return null;
    }
}

async function loadCourseFiles(courseId) {
    const container = document.getElementById(`${courseId}-files`);
    if (!container) return;
    try {
        const res = await fetch(`/api/files/${courseId}`);
        const files = await res.json();
        if (!files || files.length === 0) {
            container.innerHTML = '<p style="color: #666;">No materials uploaded yet.</p>';
            return;
        }
        container.innerHTML = files.map(file => `
            <div class="file-item">
                <div>
                    <div class="file-link">${escapeHtml(file.name)}</div>
                    <div class="file-size">${formatFileSize(file.size)} • ${new Date(file.uploadDate).toLocaleDateString()}</div>
                </div>
                <button class="view-file" onclick="window.open('/data/${courseId}/${encodeURIComponent(file.name)}', '_blank')">View</button>
            </div>
        `).join('');
    } catch (e) {
        container.innerHTML = '<p style="color: #666;">Unable to load materials.</p>';
    }
}

async function submitPendingQuestion(question, courseId) {
    try {
        await fetch('/api/pending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, course_id: courseId }),
        });
    } catch (e) {
        console.error('Failed to submit pending question:', e);
    }
}

async function fetchPendingQuestions() {
    try {
        const res = await fetch('/api/pending');
        return await res.json();
    } catch (e) {
        return [];
    }
}

async function approveAnswer(questionId, answer, citation) {
    try {
        const res = await fetch('/api/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question_id: questionId, answer, citation }),
        });
        return await res.json();
    } catch (e) {
        console.error('Failed to approve answer:', e);
        return null;
    }
}

async function fetchKnowledgeBase(courseId) {
    try {
        const res = await fetch(`/api/knowledge-base/${courseId}`);
        return await res.json();
    } catch (e) {
        return [];
    }
}

async function addKnowledgeBase(courseId, question, answer, citation) {
    try {
        await fetch(`/api/knowledge-base/${courseId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, answer, citation }),
        });
    } catch (e) {
        console.error('Failed to add knowledge base entry:', e);
    }
}

async function deleteKnowledgeBase(courseId, index) {
    try {
        await fetch(`/api/knowledge-base/${courseId}/${index}`, { method: 'DELETE' });
    } catch (e) {
        console.error('Failed to delete knowledge base entry:', e);
    }
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

console.log('SuperTA API Client Ready');
