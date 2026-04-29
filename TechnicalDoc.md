# SuperTA — Technical Documentation

## Section 1: System Architecture

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              SUPER TA SYSTEM                                 │
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────────┐   │
│  │   Student    │    │   Teacher    │    │        FastAPI Backend       │   │
│  │   Browser    │    │   Browser    │    │         (main.py)            │   │
│  │              │    │              │    │                              │   │
│  │ student.html │───▶│ teacher.html │───▶│  ┌────────────────────────┐  │   │
│  │              │◀───│              │◀───│  │  /api/chat (POST)      │  │   │
│  │ script.js    │    │ script.js    │    │  │  /api/approve (POST)   │  │   │
│  │              │    │              │    │  │  /api/pending (GET/POST)│ │   │
│  │ style.css    │    │              │    │  │  /api/files (GET/POST)  │  │   │
│  │              │    │              │    │  │  /api/knowledge-base    │  │   │
│  └──────────────┘    └──────────────┘    │  └──────────┬─────────────┘  │   │
│         │                                 │             │                │   │
│         │ MathJax 3.0                     │  ┌──────────▼─────────────┐  │   │
│         │ (LaTeX rendering)               │  │  PDF Context Cache     │  │   │
│         │                                 │  │  (in-memory dict)      │  │   │
│         │                                 │  │                        │  │   │
│         │                                 │  │  ┌──────────────────┐  │  │   │
│         │                                 │  │  │  pypdf Reader    │  │  │   │
│         │                                 │  │  │  (page-level)    │  │  │   │
│         │                                 │  │  └────────┬─────────┘  │  │   │
│         │                                 │  └───────────┼────────────  │   │
│         │                                 │              │               │   │
│         │                                 │  ┌───────────▼────────────┐  │   │
│         │                                 │  │  Keyword Scoring &     │  │   │
│         │                                 │  │  Context Assembly      │  │   │
│         │                                 │  │  (top 15 pages)        │  │   │
│         │                                 │  └───────────┬────────────  │   │
│         │                                 │              │               │   │
│         │                                 │  ┌───────────▼────────────┐  │   │
│         │                                 │  │  Qwen 3.6 Plus         │  │   │
│         │                                 │  │  (DashScope API)       │  │   │
│         │                                 │  │  1M token context      │  │   │
│         │                                 │  │  + Web Search Tool     │  │   │
│         │                                 │  └───────────┬────────────┘  │   │
│         │                                 │              │               │   │
│         │                                 │  ┌───────────▼────────────┐  │   │
│         │                                 │  │  Dual Citation Parser  │  │   │
│         │                                 │  │  (PDF 📖 / Web 🌐)     │  │   │
│         │                                 │  └───────────┬────────────┘  │   │
│         │                                 └──────────────┼───────────────┘   │
│         │                                                │                   │
│         │                                 ┌──────────────▼───────────────┐   │
│         │                                 │  Persistent Memory           │   │
│         │                                 │                              │   │
│         │                                 │  knowledge_base.json         │   │
│         │                                 │  (teacher-approved Q&A)      │   │
│         │                                 │                              │   │
│         │                                 │  pending_questions.json      │   │
│         │                                 │  (unanswered student Qs)     │   │
│         │                                 └──────────────────────────────┘   │
│         │                                                                    │
│         └────────────────────────────────────────────────────────────────────┘
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  /data/rbe211/                                                       │   │
│  │  9 PDF lecture slides (278 pages total)                              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  DashScope Web Search (built-in tool)                                │   │
│  │  Activated when PDF context is insufficient                          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘

Data Flow Legend:
  ──▶  HTTP request (fetch API from browser to FastAPI)
  ◀──  JSON response (FastAPI back to browser)
  │    Internal data flow within the backend
  ▼    Sequential processing step
```

### Component Overview

**Student Browser (student.html + script.js)** — The student-facing web interface. It renders the course dashboard, displays uploaded materials, and provides a chat interface for each course. All communication with the backend uses `fetch()` calls to the FastAPI `/api/chat` endpoint. The UI displays AI responses with page-level citations (📖 for PDF sources, 🌐 for web sources) and a green "Teacher Approved" badge when applicable. MathJax 3.0 renders all LaTeX formulas inline.

**Teacher Browser (teacher.html + script.js)** — The teacher-facing management portal. It allows instructors to upload PDF course materials (which are stored on the server and automatically ingested), review pending student questions, write and approve answers (which are persisted to `knowledge_base.json`), and manage the common Q&A knowledge base for each course. MathJax 3.0 is also loaded here for rendering formulas in teacher-drafted answers.

**FastAPI Backend (main.py)** — The central "Brain" of SuperTA. It serves static frontend files, handles all API requests, manages PDF ingestion and context caching, routes queries to the Qwen AI service with hybrid search (PDF ground truth + web search fallback), and persists teacher-approved answers to JSON files. It runs on port 8000 and exposes RESTful endpoints for chat, file management, and knowledge base operations.

**PDF Context Cache** — An in-memory dictionary that stores all extracted text from PDF lecture slides, indexed by course ID. Each page is stored with its filename and page number. At startup, all PDFs in `/data/{course_id}/` are parsed using `pypdf`. When a new PDF is uploaded by a teacher, the cache is automatically refreshed. This keeps the 278 pages of RBE211 materials "warm" for instant retrieval during student queries.

**Qwen 3.6 Plus with Hybrid Search (DashScope API)** — The AI reasoning engine. It receives a system prompt defining SuperTA's persona, the student's question, and the top 15 most relevant PDF pages (selected by keyword scoring). It first attempts to answer from the PDF context. If the information is missing, it explicitly states this and then uses the built-in web_search tool to gather supplementary information. It generates technical answers with LaTeX math formatting and appends the appropriate citation (📖 for PDF, 🌐 for web). The backend parses this citation using dual regex patterns and returns it as a structured JSON field with a `source_type` indicator.

**MathJax 3.0 (CDN)** — A client-side JavaScript library loaded from jsdelivr CDN that renders LaTeX mathematical expressions in the browser. It processes inline math `\( ... \)` and display math `\[ ... \]` delimiters, converting them to properly formatted SVG equations. Called via `MathJax.typesetPromise()` after each new chat message is appended to the DOM.

**Persistent Memory (JSON files)** — Two JSON files act as the system's long-term storage. `knowledge_base.json` stores teacher-approved question-answer-citation triples, organized by course ID. `pending_questions.json` stores student questions that have been submitted but not yet answered by a teacher. Both files are read and written on every relevant API call, ensuring data persists across server restarts.

### Data Flow: Student Asks a Question

1. **Origin** — A student types a question into the SuperTA chat input on `student.html` and clicks "Ask SuperTA" or presses Enter.

2. **Frontend → Backend** — The `askQuestion()` function in `student.html` calls `askSuperTA()` from `script.js`, which sends a `POST` request to `/api/chat` with JSON body `{ "question": "...", "course_id": "rbe211" }`.

3. **Knowledge Base Check** — The FastAPI `/api/chat` endpoint first loads `knowledge_base.json` and performs a fuzzy string match against the student's question. If a teacher-approved answer exists, it is returned immediately with `"approved": true` and `"source_type": "pdf"`.

4. **Context Retrieval** — If no approved answer exists, the backend retrieves the cached PDF pages for the specified course. It tokenizes the student's question into keywords (filtering out common stop words), scores each cached page by keyword overlap, and selects the top 15 most relevant pages.

5. **Hybrid AI Query** — The backend constructs a prompt containing the system prompt, the student's question, and the assembled PDF context. This is sent to Qwen 3.6 Plus with the `web_search` tool enabled. The model first attempts to answer from the PDF context. If the answer is not found, it explicitly states "I could not find this information in the course slides" and then invokes the web_search tool for supplementary information.

6. **Tool Call Handling** — If Qwen decides to search the web, it returns a `tool_calls` array. The backend executes the web search by making a second API call with the tool results appended to the conversation. Qwen then generates a final answer combining any PDF knowledge with web search results.

7. **Dual Citation Parsing** — The raw AI response is processed by `parse_ai_response()`, which uses two regex patterns: one for PDF citations (`📖 Source: ...`) and one for web citations (`🌐 Online Source: ...`). The answer text, citation, and `source_type` ("pdf", "web", or "unknown") are extracted into separate fields.

8. **Response → Frontend** — The backend returns JSON `{ "answer": "...", "citation": "...", "source_type": "pdf|web", "approved": false }` to the browser. The frontend renders the answer in the chat bubble with the appropriate source badge (blue 📖 for PDF, green 🌐 for web).

9. **MathJax Rendering** — After the message is appended to the DOM, `MathJax.typesetPromise([botMsg])` is called to render any LaTeX expressions (e.g., `\( m\ddot{x} + b\dot{x} + kx = F \)`) as properly formatted mathematical notation.

10. **Storage** — If the teacher later approves this answer via the teacher portal, it is moved into `knowledge_base.json` and will be served directly (step 3) on future matching queries, bypassing the AI entirely.

---

## Section 2: Technology Justification

| Technology/Tool | What we chose | Alternatives considered | Why we chose this |
| :--- | :--- | :--- | :--- |
| **Backend Framework** | FastAPI (Python) | Flask, Django, Node.js/Express | FastAPI provides native async support (critical for concurrent AI API calls and tool-call loops), automatic OpenAPI documentation for testing, and Pydantic models for request validation. Flask lacks async out of the box; Django is overkill for an API-only backend; Express would require rewriting our Python-based PDF processing pipeline. |
| **AI Model** | Qwen 3.6 Plus via DashScope | GPT-4o, Claude 3.5, Llama 3 (local) | Qwen 3.6 Plus offers a 1M token context window at a lower cost than GPT-4o, which is essential for ingesting 278 pages of lecture slides per query. It also has a built-in `web_search` tool in the DashScope API, enabling hybrid search without implementing a separate search backend. Open-source models (Llama) would require GPU hardware we don't have. Claude's context window is large but API costs are higher and it lacks a built-in web search tool in compatible mode. |
| **PDF Parser** | pypdf | PyMuPDF (fitz), pdfplumber, pdfminer.six | pypdf is pure Python with zero system-level dependencies, making it trivial to install across team members' machines. PyMuPDF requires compiled C extensions that caused installation issues on Windows. pdfplumber and pdfminer are slower and more complex to configure. pypdf's page-level extraction is sufficient for our keyword-scoring approach. |
| **Persistent Storage** | JSON files (knowledge_base.json, pending_questions.json) | SQLite, PostgreSQL, MongoDB | JSON files require zero setup, no database server, and no migration scripts — ideal for an MVP with a single instructor and ~100 students. SQLite would add complexity with no meaningful benefit at this scale. PostgreSQL/MongoDB are overkill and would require Docker or cloud hosting. |
| **Frontend** | Vanilla JavaScript + HTML + CSS | React, Vue, Angular, Svelte | The existing codebase was already written in vanilla JS. Migrating to a framework would require a build pipeline (Webpack/Vite), npm dependencies, and significant refactoring — none of which add value for a prototype with three static pages. Vanilla JS loads instantly with zero build step. |
| **Math Rendering** | MathJax 3.0 (CDN) | KaTeX, server-side LaTeX rendering | MathJax 3.0 supports the full LaTeX standard used in engineering coursework (matrices, integrals, partial derivatives). KaTeX is faster but has limited symbol support. Server-side rendering would add complexity and latency. The CDN approach requires zero installation and works offline after first load (browser cache). |
| **HTTP Client** | httpx (async) | requests, aiohttp | httpx provides a clean async API that matches FastAPI's async handlers, supports both sync and async usage, and has a requests-compatible interface. `requests` is synchronous and would block the event loop. `aiohttp` has a more complex API and is overkill for simple POST calls. |
| **File Upload** | python-multipart (FastAPI built-in) | Base64-in-JSON (original approach) | The original frontend stored files as base64 strings in localStorage, which is limited to ~5MB and corrupts binary data. python-multipart enables proper multipart/form-data uploads directly to the server's filesystem, supporting files of any size with correct binary preservation. |

### Technical Risks and Mitigation

**AI citation hallucination** — The Qwen model may generate plausible-looking but incorrect page citations. We mitigate this by: (1) providing exact page-numbered context in the prompt so the model can reference real pages, (2) instructing the model to say "I could not find this in the course slides" when information is absent, (3) falling back to web search with a different citation format (🌐) so students can distinguish PDF-grounded answers from web-sourced overviews, and (4) requiring teacher approval before any AI-generated answer enters the permanent knowledge base.

**Web search quality variance** — The built-in DashScope web_search tool may return results from non-academic or unreliable sources. We mitigate this by: (1) using web search only as a fallback when PDF materials are insufficient, (2) clearly labeling web-sourced answers with the 🌐 badge so students know the information is not from their course slides, and (3) the teacher approval workflow serves as a final quality gate.

**PDF text extraction quality** — pypdf may fail to extract text from slides with complex layouts, images, or embedded fonts. We mitigate this by: (1) ingesting all pages at startup and logging failures, (2) falling back to web search when no relevant context is found, and (3) allowing teachers to manually add Q&A entries for content that PDF extraction misses.

**MathJax rendering latency** — MathJax 3.0 can be slow to render complex equations on the first load. We mitigate this by: (1) loading MathJax asynchronously so it doesn't block page rendering, (2) using the SVG output format which is faster than HTML-CSS, and (3) only re-rendering the newly appended message (not the entire chat history) via `MathJax.typesetPromise([botMsg])`.

**API key exposure** — The DashScope API key is hardcoded in `main.py`. In production this would be a security risk. For this MVP it is acceptable because: (1) the key is not exposed to the frontend (all AI calls are server-side), (2) the repository is private, and (3) the key has usage limits. For production deployment, the key should be moved to an environment variable or secrets manager.

**No user authentication** — Anyone with the URL can access both student and teacher portals. This is out of scope for the MVP but is a known limitation. A production version would add login screens, role-based access control, and session management.

---

## Section 3: Deployment Guide

### Environment Requirements

| Requirement | Version / Notes |
| :--- | :--- |
| Python | 3.12 or later |
| pip | Bundled with Python 3.12 |
| Operating System | Windows, macOS, or Linux |
| Internet connection | Required for Qwen API calls, web search, and MathJax CDN |
| Disk space | ~50MB for dependencies + PDF storage |
| Port | 8000 must be available |

### Setup Steps

1. **Clone the repository:**
   ```
   git clone https://github.com/Ziyu-lia/ENT208TC_Group-29.git
   cd ENT208TC_Group-29
   ```

2. **Install dependencies:**
   ```
   pip install -r requirements.txt
   ```

3. **Verify the API key is set:**
   Open `main.py` and confirm the `QWEN_API_KEY` variable contains a valid DashScope API key. In production, replace the hardcoded value with an environment variable:
   ```python
   QWEN_API_KEY = os.environ.get("QWEN_API_KEY", "sk-...")
   ```

4. **Place course PDFs in the data folder:**
   Create a subfolder under `data/` named after your course ID (e.g., `data/rbe211/`) and copy all lecture slide PDFs into it. The server will automatically ingest them on startup.

5. **Run the application:**
   ```
   python main.py
   ```
   You should see output ending with:
   ```
   INFO: Uvicorn running on http://0.0.0.0:8000
   INFO: PDF cache warmed: ['rbe211']
   INFO: Application startup complete.
   ```

6. **Verify it is working:**
   - Open a browser and navigate to `http://localhost:8000` — the Student Portal should load with full styling.
   - Click **Courses** → **RBE211 - Dynamic Systems** → **SuperTA Assistant**.
   - Type a question (e.g., "What is the Lagrange method?") and click "Ask SuperTA".
   - You should receive an answer with a citation like `📖 Source: 4 Lagrange Method - RBE211TC XJTLU.pdf, Page 12`.
   - Ask a question not covered in the slides (e.g., "When is the final exam?") — you should see the AI state it couldn't find the info in slides, then provide a web-sourced answer with `🌐 Online Source: ...`.
   - Open `http://localhost:8000/teacher` to access the Teacher Portal.

### Common Issues and Solutions

| Problem | Likely cause | Solution |
| :--- | :--- | :--- |
| `ModuleNotFoundError: No module named 'fastapi'` | Dependencies not installed | Run `pip install -r requirements.txt` in the project directory. If you get permission errors, use `pip install --user -r requirements.txt`. |
| `Address already in use` on port 8000 | Another process is using port 8000 (possibly a previous server instance) | On Windows, run `netstat -ano | findstr :8000` to find the process ID, then `taskkill /PID <id> /F`. Or change the port in `main.py` to a different number (e.g., 8001). |
| Chat returns "AI service error" or 502 | Invalid/expired API key, or no internet connection | Check that `QWEN_API_KEY` in `main.py` is correct and active. Verify your internet connection. Check the terminal for the exact error message from the DashScope API. |
| PDFs not appearing in Materials tab | PDFs not placed in the correct `data/{course_id}/` folder, or server not restarted after adding them | Ensure PDFs are in `data/rbe211/` (matching the course ID used in the frontend). Restart the server with `python main.py` — PDFs are only ingested at startup and after upload via the teacher portal. |
| Page loads without styling (plain text) | CSS/JS paths are broken | Ensure you are accessing `http://localhost:8000` (not opening the HTML file directly from disk). The FastAPI server must be running to serve static files correctly. |
| Math formulas show as raw LaTeX (e.g., `\( x \)`) | MathJax CDN failed to load or internet is offline | Check your internet connection — MathJax loads from `cdn.jsdelivr.net`. If offline, formulas will display as raw text. The first load may take a few seconds while MathJax downloads. |
| Response cuts off mid-sentence | `max_tokens` limit reached | The backend now uses `max_tokens: 4096` to prevent truncation. If responses are still cut off, the question may be too broad — try asking a more specific question. |

---

## Section 5: Limitations & Future Work

### Known Limitations

| Limitation | Why it exists | Impact on users |
| :--- | :--- | :--- |
| **No user authentication** | Out of scope for the MVP; would require a database, session management, and login UI. | Anyone with the URL can access both student and teacher portals. In a real deployment, students could see teacher-only controls and teachers could be impersonated. |
| **No conversation history** | The chat interface is stateless — each question is independent. Implementing history would require per-session storage. | Students cannot scroll back to review previous answers in the same session. Refreshing the page clears the chat. |
| **Web search results may include non-academic sources** | The DashScope web_search tool aggregates from the open web without academic filtering. | Web-sourced answers (🌐) may reference blogs, forums, or non-peer-reviewed content. Students are advised to verify with course materials. The teacher approval workflow mitigates this for permanent knowledge base entries. |
| **JSON file storage does not scale** | Reading/writing entire JSON files on every API call is O(n) and not thread-safe for concurrent writes. | With hundreds of concurrent users, file I/O could become a bottleneck or cause data corruption. Acceptable for the current single-teacher, small-class MVP. |
| **PDF text extraction is imperfect** | pypdf extracts raw text without layout awareness. Slides with diagrams, equations as images, or complex formatting may lose information. | Questions about visual content (circuit diagrams, free-body diagrams) may receive incomplete or incorrect answers. The web search fallback partially compensates. Teachers can manually add Q&A entries to fill gaps. |
| **No teacher AI draft generation** | The teacher portal requires manual answer entry. The AI could pre-draft answers for teacher review, but this was deprioritized. | Teachers must type every answer from scratch, which is time-consuming. The current workflow works but is not optimized for high question volume. |
| **Single-course focus (RBE211)** | Only RBE211 has PDF materials loaded. Other courses (CS101, MATH201, PHYS101) rely on pre-seeded knowledge base entries and general AI knowledge with web search. | Students in non-RBE211 courses receive web-sourced answers (🌐) rather than slide-grounded answers (📖). Adding PDFs for other courses is a configuration change, not a code change. |
| **MathJax requires internet for first load** | MathJax 3.0 is loaded from a CDN (jsdelivr.net). | On first page load without internet, mathematical formulas will display as raw LaTeX text. After the first load, the browser caches MathJax and it works offline. |

### Future Work

* **Teacher AI draft generation** — When a student question arrives, the backend could automatically generate a draft answer using Qwen and present it to the teacher for review/edit/approval in the teacher portal. This would reduce the teacher's workload from "write from scratch" to "review and refine."

* **Conversation history with session IDs** — Implement browser-based session IDs (or simple localStorage-based chat history) so students can scroll back through previous Q&A within a session. For persistence across devices, a lightweight SQLite database would be needed.

* **Vector-based semantic search** — Replace the current keyword-scoring context retrieval with embeddings-based semantic search (e.g., using sentence-transformers). This would find relevant slide content even when the student's wording differs significantly from the slide text, improving answer accuracy for paraphrased questions.

* **Role-based authentication** — Add a simple login system with student and teacher roles. Students would only see the student portal; teachers would access the teacher portal with upload and approval capabilities. This could be implemented with JWT tokens and a password hash store in SQLite.

* **Academic source filtering for web search** — Implement a post-processing step that filters web search results to prioritize academic sources (university domains, .edu, .ac.uk, arXiv, IEEE, etc.) before feeding them to Qwen. This would improve the quality of web-sourced answers.

* **Local MathJax bundle** — Download and serve MathJax 3.0 locally instead of from CDN, ensuring math rendering works fully offline. This is important for campus networks with restricted internet access.

* **Multi-format material support** — Extend PDF ingestion to support PowerPoint (.pptx), Word (.docx), and image-based slides (via OCR). Many instructors create materials in PowerPoint, and converting them to PDF manually is a friction point.

* **Analytics dashboard** — Track which questions are asked most frequently, which PDF pages are referenced most often, and how long students wait for answers. This data would help instructors identify confusing topics and improve course materials.
