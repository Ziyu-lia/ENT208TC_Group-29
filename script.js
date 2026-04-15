// Tab Switching (Home, Courses, Profile)
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        
        // Update active states
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');
    });
});

// Course Switching (Sidebar)
document.querySelectorAll('.course-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const courseId = btn.dataset.course;
        
        // Update active states
        document.querySelectorAll('.course-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        document.querySelectorAll('.course-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${courseId}-content`).classList.add('active');
    });
});

// Course Navigation (Overview, Materials, Assignment, SuperTA)
document.querySelectorAll('.course-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        const courseContent = btn.closest('.course-content');
        
        // Update active states within this course
        courseContent.querySelectorAll('.course-nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        courseContent.querySelectorAll('.section-content').forEach(content => content.classList.remove('active'));
        courseContent.querySelector(`#${section}`).classList.add('active');
    });
});

// Knowledge Base for SuperTA (Simulated AI with citations)
const knowledgeBase = {
    cs101: {
        "when is the deadline": { 
            answer: "The Module 1 Assignment is due on March 30, 2026 at 11:59 PM.",
            citation: "CS101 Assignment Sheet, Page 1",
            approved: true
        },
        "what format should the assignment be": {
            answer: "Submit your assignment as a .py file. Name it 'FirstName_LastName_Assignment1.py'",
            citation: "CS101 Assignment Guidelines, Section 3",
            approved: true
        },
        "how many pages should the report be": {
            answer: "The written report should be 3-5 pages, double-spaced, excluding code listings.",
            citation: "CS101 Module Handbook, Page 15",
            approved: true
        },
        "what is a variable": {
            answer: "A variable is a named container that stores data in memory. Think of it as a labeled box where you can put values like numbers or text.",
            citation: "CS101 Lecture Slides Week 2",
            approved: false
        },
        "how to install python": {
            answer: "Download Python from python.org, run the installer, and make sure to check 'Add Python to PATH' during installation.",
            citation: "CS101 Getting Started Guide",
            approved: false
        }
    },
    math201: {
        "when is the exam": {
            answer: "The Mid-term Exam is scheduled for April 15, 2026.",
            citation: "MATH201 Course Syllabus",
            approved: true
        },
        "what is a derivative": {
            answer: "A derivative measures how a function changes as its input changes. It represents the slope of the tangent line at any point.",
            citation: "Stewart Calculus, Chapter 2",
            approved: false
        }
    },
    phys101: {
        "what is newton's first law": {
            answer: "An object at rest stays at rest, and an object in motion stays in motion with constant velocity unless acted upon by an external force.",
            citation: "Physics Fundamentals Textbook, Chapter 4",
            approved: true
        }
    }
};

// Store pending questions for teacher approval
let pendingQuestions = [];

// Generic function to handle SuperTA chat for any course
function setupSuperTA(courseId, chatMessagesId, inputId) {
    const input = document.getElementById(inputId);
    const sendButton = input?.nextElementSibling;
    
    if (!input || !sendButton) return;
    
    const sendMessage = () => {
        const question = input.value.trim();
        if (!question) return;
        
        // Add user message to chat
        const messagesDiv = document.getElementById(chatMessagesId);
        const userMsgDiv = document.createElement('div');
        userMsgDiv.className = 'message user';
        userMsgDiv.innerHTML = `<strong>You:</strong> ${escapeHtml(question)}`;
        messagesDiv.appendChild(userMsgDiv);
        
        // Look for answer in knowledge base
        const lowerQuestion = question.toLowerCase();
        const courseKB = knowledgeBase[courseId] || {};
        let answer = null;
        let citation = null;
        let approved = false;
        
        // Check for matching question
        for (const [key, value] of Object.entries(courseKB)) {
            if (lowerQuestion.includes(key) || key.includes(lowerQuestion)) {
                answer = value.answer;
                citation = value.citation;
                approved = value.approved;
                break;
            }
        }
        
        if (answer) {
            // Found answer in knowledge base
            const botMsgDiv = document.createElement('div');
            botMsgDiv.className = 'message bot';
            let approvedBadge = approved ? '<span class="teacher-approved">✓ Teacher Approved</span>' : '';
            botMsgDiv.innerHTML = `<strong>SuperTA:</strong> ${escapeHtml(answer)}${approvedBadge}<div class="citation">📖 Source: ${escapeHtml(citation)}</div>`;
            messagesDiv.appendChild(botMsgDiv);
        } else {
            // No answer found - add to teacher pending questions
            const pendingId = Date.now();
            pendingQuestions.push({
                id: pendingId,
                course: courseId,
                question: question,
                timestamp: new Date().toLocaleString()
            });
            
            const botMsgDiv = document.createElement('div');
            botMsgDiv.className = 'message bot';
            botMsgDiv.innerHTML = `<strong>SuperTA:</strong> I don't have an answer for that yet. I've notified the teacher! They'll review and approve an answer soon. 👩‍🏫`;
            messagesDiv.appendChild(botMsgDiv);
            
            updateTeacherPanel();
        }
        
        // Scroll to bottom
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        input.value = '';
    };
    
    sendButton.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

// Initialize all SuperTA chats
setupSuperTA('cs101', 'chat-messages', 'user-question');
setupSuperTA('math201', 'math-chat', 'math-question');
setupSuperTA('phys101', 'phys-chat', 'phys-question');

// Teacher Panel Functions
function updateTeacherPanel() {
    const container = document.getElementById('teacher-questions-list');
    if (!container) return;
    
    if (pendingQuestions.length === 0) {
        container.innerHTML = '<p><em>No pending questions. Students haven\'t asked anything new yet!</em></p>';
        return;
    }
    
    container.innerHTML = pendingQuestions.map(q => `
        <div class="teacher-question-item" data-id="${q.id}">
            <strong>${q.course.toUpperCase()}</strong><br>
            <em>"${escapeHtml(q.question)}"</em><br>
            <small>Asked: ${q.timestamp}</small><br>
            <input type="text" id="answer-${q.id}" placeholder="Type teacher-approved answer..." style="width: 100%; margin: 8px 0; padding: 4px;">
            <input type="text" id="citation-${q.id}" placeholder="Source citation..." style="width: 100%; margin: 4px 0; padding: 4px;">
            <button class="approve-btn" onclick="approveAnswer(${q.id}, '${q.course}')">✓ Approve & Add to Knowledge Base</button>
        </div>
    `).join('');
}

// Make approveAnswer globally accessible
window.approveAnswer = function(questionId, courseId) {
    const answerInput = document.getElementById(`answer-${questionId}`);
    const citationInput = document.getElementById(`citation-${questionId}`);
    
    if (!answerInput || !citationInput) return;
    
    const answer = answerInput.value.trim();
    const citation = citationInput.value.trim();
    
    if (!answer || !citation) {
        alert('Please provide both an answer and a citation before approving.');
        return;
    }
    
    // Find the pending question
    const questionObj = pendingQuestions.find(q => q.id === questionId);
    if (!questionObj) return;
    
    // Add to knowledge base
    if (!knowledgeBase[courseId]) {
        knowledgeBase[courseId] = {};
    }
    
    const questionKey = questionObj.question.toLowerCase();
    knowledgeBase[courseId][questionKey] = {
        answer: answer,
        citation: citation,
        approved: true
    };
    
    // Remove from pending
    pendingQuestions = pendingQuestions.filter(q => q.id !== questionId);
    
    // Update UI
    updateTeacherPanel();
    
    // Notify student (simulated - in real app would push notification)
    alert(`Answer approved for "${questionObj.question}". Students can now get this teacher-approved answer!`);
    
    // Optional: Add notification to relevant chat
    const chatMap = {
        cs101: 'chat-messages',
        math201: 'math-chat',
        phys101: 'phys-chat'
    };
    
    const messagesDiv = document.getElementById(chatMap[courseId]);
    if (messagesDiv) {
        const notification = document.createElement('div');
        notification.className = 'message bot';
        notification.innerHTML = `<strong>System:</strong> 📢 Teacher has approved a new answer for "${escapeHtml(questionObj.question)}"! Try asking again.`;
        messagesDiv.appendChild(notification);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
};

// File viewing simulation
document.querySelectorAll('.view-file').forEach(btn => {
    btn.addEventListener('click', () => {
        const fileName = btn.dataset.file || 'document.pdf';
        alert(`📄 Simulated file viewer\n\nOpening: ${fileName}\n\n(In a real app, this would download or display the actual file.)`);
    });
});

// Helper function to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Initialize first course navigation active states
document.querySelectorAll('.course-content').forEach(course => {
    const firstNavBtn = course.querySelector('.course-nav-btn');
    const firstSection = course.querySelector('.section-content');
    if (firstNavBtn && firstSection) {
        firstNavBtn.classList.add('active');
        firstSection.classList.add('active');
    }
});

console.log('EduAI Learning Center Ready! 🎓');