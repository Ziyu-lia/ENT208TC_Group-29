import json
import os
import re
import logging
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pypdf import PdfReader

# ── Configuration ─────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
STATIC_DIR = BASE_DIR / "static"
KB_FILE = BASE_DIR / "knowledge_base.json"
PENDING_FILE = BASE_DIR / "pending_questions.json"

QWEN_API_KEY = "sk-5478ef0c1b684875ad4c7979bd8f9d04"
QWEN_API_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
QWEN_MODEL = "qwen-plus"

SYSTEM_PROMPT = (
    "You are SuperTA, the digital twin of an XJTLU professor. "
    "You have perfect memory of the course materials provided. "
    "Answer questions technically and precisely. "
    "Use LaTeX formatting for all mathematical expressions: inline math with \\( ... \\) and display math with \\[ ... \\]. "
    "CRITICAL: Your response must be COMPLETE. Never cut off mid-sentence or mid-word. "
    "If you are approaching the token limit, summarize concisely rather than truncating. "
    "Always end your response with exactly one citation line — no extra text after it."
)

HYBRID_INSTRUCTION = (
    "HYBRID SEARCH PROTOCOL:\n"
    "1. FIRST, search the provided PDF course materials for the answer.\n"
    "2. If the answer IS found in the slides, respond using only the slide content. "
    "   End with: 📖 Source: [Document Name], Page [N]\n"
    "3. If the answer is NOT found or the slides are insufficient, explicitly state: "
    "   'I could not find this information in the course slides.' Then provide a "
    "   comprehensive overview from your general knowledge and/or web search. "
    "   End with: 🌐 Online Source: [Domain Name]\n"
    "4. If no PDF materials are provided for this course, answer from general knowledge "
    "   and end with: 🌐 Online Source: General Knowledge\n"
    "5. NEVER fabricate page numbers or document names. If citing a PDF, the page must exist."
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("superta")

# ── PDF Context Cache ──────────────────────────────────────────────────────────

pdf_cache: dict[str, list[dict]] = {}


def ingest_pdfs(course_id: str) -> list[dict]:
    course_dir = DATA_DIR / course_id
    pages = []
    if not course_dir.exists():
        return pages
    for pdf_path in sorted(course_dir.glob("*.pdf")):
        try:
            reader = PdfReader(str(pdf_path))
            for page_num, page in enumerate(reader.pages, start=1):
                text = page.extract_text() or ""
                text = text.strip()
                if text:
                    pages.append({
                        "filename": pdf_path.name,
                        "page": page_num,
                        "text": text,
                    })
            logger.info(f"Ingested {len(pages)} pages from {pdf_path.name}")
        except Exception as e:
            logger.error(f"Failed to read {pdf_path.name}: {e}")
    return pages


def warm_cache():
    for course_dir in DATA_DIR.iterdir():
        if course_dir.is_dir():
            cid = course_dir.name
            pdf_cache[cid] = ingest_pdfs(cid)
    logger.info(f"PDF cache warmed: {list(pdf_cache.keys())}")


def search_context(course_id: str, question: str, max_pages: int = 15) -> str:
    pages = pdf_cache.get(course_id, [])
    if not pages:
        return ""

    keywords = [w.lower() for w in re.findall(r'\w{3,}', question) if w.lower() not in (
        "what", "when", "where", "which", "who", "how", "why", "does", "is", "are",
        "the", "and", "for", "with", "this", "that", "from", "have", "has", "can",
        "could", "would", "should", "will", "about", "explain", "tell", "please",
    )]

    scored = []
    for p in pages:
        text_lower = p["text"].lower()
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > 0:
            scored.append((score, p))

    scored.sort(key=lambda x: x[0], reverse=True)
    selected = scored[:max_pages]

    if not selected:
        selected = [(0, p) for p in pages[:max_pages]]

    context_parts = []
    for _, p in selected:
        context_parts.append(
            f"[Document: {p['filename']}, Page {p['page']}]\n{p['text']}\n"
        )

    return "\n---\n".join(context_parts)


# ── JSON Helpers ───────────────────────────────────────────────────────────────

def load_json(path: Path) -> dict | list:
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {} if path == KB_FILE else []


def save_json(path: Path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def find_approved_answer(course_id: str, question: str) -> Optional[dict]:
    kb = load_json(KB_FILE)
    course_entries = kb.get(course_id, [])
    q_lower = question.lower()
    for entry in course_entries:
        if entry["question"].lower() in q_lower or q_lower in entry["question"].lower():
            return entry
    return None


# ── Qwen API Call with Tool Support ────────────────────────────────────────────

WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": "Search the web for up-to-date or supplementary information.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query.",
                }
            },
            "required": ["query"],
        },
    },
}


async def call_qwen_with_tools(
    system: str,
    user_prompt: str,
    context: str,
    has_pdfs: bool,
) -> tuple[str, str]:
    headers = {
        "Authorization": f"Bearer {QWEN_API_KEY}",
        "Content-Type": "application/json",
    }

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_prompt},
    ]

    payload = {
        "model": QWEN_MODEL,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 4096,
        "tools": [WEB_SEARCH_TOOL],
        "tool_choice": "auto",
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(QWEN_API_URL, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

        choice = data["choices"][0]["message"]

        if choice.get("tool_calls"):
            logger.info("Qwen requested web search — executing tool call")
            messages.append(choice)

            for tool_call in choice["tool_calls"]:
                if tool_call["function"]["name"] == "web_search":
                    args = json.loads(tool_call["function"]["arguments"])
                    search_query = args.get("query", "")
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "content": f"Web search results for '{search_query}': "
                                   f"Use your general knowledge to provide a comprehensive answer. "
                                   f"Cite the source domain in your final citation.",
                    })

            payload2 = {
                "model": QWEN_MODEL,
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 4096,
            }
            resp2 = await client.post(QWEN_API_URL, json=payload2, headers=headers)
            resp2.raise_for_status()
            data2 = resp2.json()
            raw = data2["choices"][0]["message"]["content"]
        else:
            raw = choice.get("content", "")

    return parse_ai_response(raw, has_pdfs, context)


def parse_ai_response(raw: str, has_pdfs: bool, context: str) -> tuple[str, str, str]:
    pdf_citation = re.compile(
        r'(?:📖\s*Source[:\s]*|Source[:\s]*|Citation[:\s]*|Reference[:\s]*)'
        r'(.+?)(?:\n|$)',
        re.IGNORECASE,
    )
    web_citation = re.compile(
        r'(?:🌐\s*Online\s*Source[:\s]*|Online\s*Source[:\s]*|Web\s*Source[:\s]*)'
        r'(.+?)(?:\n|$)',
        re.IGNORECASE,
    )

    web_match = web_citation.search(raw)
    pdf_match = pdf_citation.search(raw)

    if web_match:
        citation = web_match.group(1).strip()
        answer = raw[:web_match.start()].strip()
        return answer or raw, citation, "web"

    if pdf_match:
        citation = pdf_match.group(1).strip()
        answer = raw[:pdf_match.start()].strip()
        if not answer:
            answer = raw
        return answer, citation, "pdf"

    if has_pdfs and context:
        return raw, "Could not determine specific page — please verify in course materials.", "pdf"

    return raw, "General Knowledge", "web"


# ── Pydantic Models ────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str
    course_id: str


class ApproveRequest(BaseModel):
    question_id: str
    answer: str
    citation: str


class PendingRequest(BaseModel):
    question: str
    course_id: str


class CommonQA(BaseModel):
    question: str
    answer: str
    citation: str


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    warm_cache()
    yield
    logger.info("SuperTA shutting down")


# ── FastAPI App ────────────────────────────────────────────────────────────────

app = FastAPI(title="SuperTA Brain", lifespan=lifespan)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/data", StaticFiles(directory=str(DATA_DIR)), name="data")


@app.get("/")
async def root():
    return FileResponse(str(STATIC_DIR / "student.html"))


@app.get("/teacher")
async def teacher_portal():
    return FileResponse(str(STATIC_DIR / "teacher.html"))


# ── Chat Endpoint ──────────────────────────────────────────────────────────────

@app.post("/api/chat")
async def chat(req: ChatRequest):
    question = req.question.strip()
    course_id = req.course_id

    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    approved = find_approved_answer(course_id, question)
    if approved:
        return {
            "answer": approved["answer"],
            "citation": approved["citation"],
            "source_type": "pdf",
            "approved": True,
        }

    context = search_context(course_id, question)
    has_pdfs = bool(context)

    if has_pdfs:
        user_prompt = (
            f"Course: {course_id}\n\n"
            f"Student question: {question}\n\n"
            f"Relevant course materials (PDF slides):\n{context}\n\n"
            f"{HYBRID_INSTRUCTION}"
        )
    else:
        user_prompt = (
            f"Course: {course_id}\n\n"
            f"Student question: {question}\n\n"
            f"No PDF course materials are available for this course.\n\n"
            f"{HYBRID_INSTRUCTION}"
        )

    system = SYSTEM_PROMPT

    try:
        answer, citation, source_type = await call_qwen_with_tools(
            system, user_prompt, context, has_pdfs
        )
    except Exception as e:
        logger.error(f"Qwen API error: {e}")
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")

    return {
        "answer": answer,
        "citation": citation,
        "source_type": source_type,
        "approved": False,
    }


# ── Pending Questions ─────────────────────────────────────────────────────────

@app.get("/api/pending")
async def get_pending():
    return load_json(PENDING_FILE)


@app.post("/api/pending")
async def add_pending(req: PendingRequest):
    pending = load_json(PENDING_FILE)
    entry = {
        "id": str(len(pending) + 1),
        "question": req.question,
        "course_id": req.course_id,
        "timestamp": __import__("datetime").datetime.now().isoformat(),
    }
    pending.append(entry)
    save_json(PENDING_FILE, pending)
    return entry


@app.delete("/api/pending/{question_id}")
async def delete_pending(question_id: str):
    pending = load_json(PENDING_FILE)
    pending = [q for q in pending if q["id"] != question_id]
    save_json(PENDING_FILE, pending)
    return {"status": "deleted"}


# ── Approve Answer ─────────────────────────────────────────────────────────────

@app.post("/api/approve")
async def approve_answer(req: ApproveRequest):
    pending = load_json(PENDING_FILE)
    question_obj = next((q for q in pending if q["id"] == req.question_id), None)
    if not question_obj:
        raise HTTPException(status_code=404, detail="Pending question not found")

    kb = load_json(KB_FILE)
    course_id = question_obj.get("course_id", "cs101")
    if course_id not in kb:
        kb[course_id] = []

    kb[course_id].append({
        "question": question_obj["question"],
        "answer": req.answer,
        "citation": req.citation,
    })
    save_json(KB_FILE, kb)

    pending = [q for q in pending if q["id"] != req.question_id]
    save_json(PENDING_FILE, pending)

    return {"status": "approved"}


# ── Knowledge Base Management ──────────────────────────────────────────────────

@app.get("/api/knowledge-base/{course_id}")
async def get_knowledge_base(course_id: str):
    kb = load_json(KB_FILE)
    return kb.get(course_id, [])


@app.post("/api/knowledge-base/{course_id}")
async def add_knowledge_base(course_id: str, qa: CommonQA):
    kb = load_json(KB_FILE)
    if course_id not in kb:
        kb[course_id] = []
    kb[course_id].append(qa.model_dump())
    save_json(KB_FILE, kb)
    return {"status": "added"}


@app.delete("/api/knowledge-base/{course_id}/{index}")
async def delete_knowledge_base(course_id: str, index: int):
    kb = load_json(KB_FILE)
    if course_id in kb and 0 <= index < len(kb[course_id]):
        kb[course_id].pop(index)
        save_json(KB_FILE, kb)
    return {"status": "deleted"}


# ── File Management ────────────────────────────────────────────────────────────

@app.get("/api/files/{course_id}")
async def list_files(course_id: str):
    course_dir = DATA_DIR / course_id
    if not course_dir.exists():
        return []
    files = []
    for f in sorted(course_dir.iterdir()):
        if f.is_file():
            stat = f.stat()
            files.append({
                "name": f.name,
                "size": stat.st_size,
                "uploadDate": __import__("datetime").datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
    return files


@app.post("/api/upload/{course_id}")
async def upload_file(course_id: str, file: UploadFile = File(...)):
    course_dir = DATA_DIR / course_id
    course_dir.mkdir(parents=True, exist_ok=True)
    dest = course_dir / file.filename
    with open(dest, "wb") as f:
        content = await file.read()
        f.write(content)

    pdf_cache[course_id] = ingest_pdfs(course_id)
    logger.info(f"Re-ingested PDFs for {course_id} after upload")

    return {"status": "uploaded", "filename": file.filename}


@app.delete("/api/files/{course_id}/{filename}")
async def delete_file(course_id: str, filename: str):
    file_path = DATA_DIR / course_id / filename
    if file_path.exists():
        file_path.unlink()
        pdf_cache[course_id] = ingest_pdfs(course_id)
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="File not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
