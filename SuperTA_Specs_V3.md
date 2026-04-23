# Project Specification: SuperTA (Backend API MVP)

## 1. Objective
Build the "Brain" (Backend API) for SuperTA using Qwen 3.6 Plus. This backend must connect to the existing frontend files (`student.html`, `teacher.html`, `script.js`, `style.css`) cloned from the team repository.

## 2. Technical Stack
- **AI Model:** Qwen 3.6 Plus (via Alibaba Cloud API)
- **Backend Framework:** FastAPI (Python)
- **Frontend Assets:** student.html, teacher.html, style.css, and script.js
- **AI Key:** sk-5478ef0c1b684875ad4c7979bd8f9d04
- **Storage:** Local JSON files (`knowledge_base.json`, `pending_questions.json`) to act as the "Persistent Memory" for teacher-approved answers.

## 3. Integration Architecture
1. **Static Hosting:** FastAPI must serve the `/static` folder containing the HTML/JS/CSS assets.
2. **API Endpoint:** Create a POST endpoint at `/api/chat`. It must accept `{ "question": "string", "course_id": "string" }`.
3. **Brain Logic:** - Check `knowledge_base.json` first for an approved answer.
   - If not found, use Qwen 3.6 Plus with the 2026 Long-Context Strategy (1M token window).
   - Ingest all PDFs in `/data/{course_id}/` for the specific module.
4. **Response Format:** Return JSON: `{ "answer": "string", "citation": "string", "approved": boolean }`.

## 4. Operational Logic for OpenCode
- **Step 1:** Reorganize the folder structure. Move HTML/JS/CSS to `/static`. Create `/data` with a subfolder for `rbe211`.
- **Step 2:** Replace the `localStorage` logic in `script.js` and the `<script>` blocks in the HTML files with `fetch()` calls to the new FastAPI `/api/chat` endpoint.
- **Step 3:** Implement Context Caching for Qwen to ensure that large lecture slide decks (PDFs) stay in active memory for fast student queries.
- **Step 4:** Ensure the backend can update `knowledge_base.json` when the teacher "approves" an answer in `teacher.html`.

## 5. System Prompt
"You are SuperTA, the digital twin of an XJTLU professor. You have perfect memory of the course materials provided. Answer questions technically and precisely. Always cite the specific page number and document name. If the information is not in the slides, state that you do not know."

* **Benchmark:** Achieve 90% accuracy on first-try answers with mandatory page-level citations.