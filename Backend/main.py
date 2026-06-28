from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
import io
import pdfplumber
import docx
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from dotenv import load_dotenv
from groq import Groq
from database import init_db, get_db
from auth import hash_password, verify_password, create_access_token, verify_token
import os
import json
import time
import random

load_dotenv()
init_db()

app = FastAPI()
security = HTTPBearer()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

class RegisterRequest(BaseModel):
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class AnalyzeRequest(BaseModel):
    resume: str
    jd: str

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    email = verify_token(token)
    if not email:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return email

@app.get("/health")
def health():
    return {"status": "ok", "message": "Resume Matcher API is running"}

@app.post("/api/register")
def register(request: RegisterRequest):
    if len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    db = get_db()
    existing = db.execute("SELECT * FROM users WHERE email = ?", (request.email,)).fetchone()
    if existing:
        db.close()
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = hash_password(request.password)
    db.execute("INSERT INTO users (email, password) VALUES (?, ?)", (request.email, hashed))
    db.commit()
    db.close()
    token = create_access_token({"sub": request.email})
    return {"token": token, "email": request.email, "message": "Account created successfully"}

@app.post("/api/login")
def login(request: LoginRequest):
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE email = ?", (request.email,)).fetchone()
    db.close()
    if not user or not verify_password(request.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token({"sub": request.email})
    return {"token": token, "email": request.email, "message": "Login successful"}

@app.post("/api/analyze")
def analyze(request: AnalyzeRequest, current_user: str = Depends(get_current_user)):
    prompt = f"""You are a strict ATS resume analyzer. Your job is to extract data only — NOT calculate the final score.

Analyze the resume against the job description and return ONLY this JSON:

{{
  "matched_skills": ["skills found in BOTH resume AND job description"],
  "missing_skills": ["skills required in JD but NOT in resume"],
  "total_required_skills": <count of all required skills in JD>,
  "years_experience_required": <number from JD or 0 if not mentioned>,
  "years_experience_candidate": <number from resume or 0 if not mentioned>,
  "education_match": <true or false>,
  "domain_match": <true or false>,
  "keyword_matches": <count of JD keywords found in resume>,
  "total_keywords": <count of all important keywords in JD>,
  "summary": "<2 honest sentences about this specific candidate for this specific job>",
  "top_tip": "<one specific actionable tip to improve match>"
}}

Return ONLY pure JSON. No markdown. No explanation. No code fences.

Resume:
{request.resume}

Job Description:
{request.jd}"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": "You are a strict data extraction assistant. Always extract the same data for the same input."
            },
            {"role": "user", "content": prompt}
        ],
        max_tokens=1000,
        temperature=0.0
    )

    content = response.choices[0].message.content.strip()
    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]
    content = content.strip()
    data = json.loads(content)

    # Calculate score in Python
    matched = len(data.get("matched_skills", []))
    total_skills = max(data.get("total_required_skills", 1), 1)
    skills_score = round((matched / total_skills) * 100)

    required_exp = data.get("years_experience_required", 0)
    candidate_exp = data.get("years_experience_candidate", 0)
    if required_exp == 0:
        exp_score = 100
    elif candidate_exp >= required_exp:
        exp_score = 100
    elif candidate_exp >= required_exp * 0.75:
        exp_score = 75
    elif candidate_exp >= required_exp * 0.5:
        exp_score = 50
    else:
        exp_score = 25

    keyword_matches = data.get("keyword_matches", 0)
    total_keywords = max(data.get("total_keywords", 1), 1)
    keyword_score = round((keyword_matches / total_keywords) * 100)

    edu_match = data.get("education_match", False)
    domain_match = data.get("domain_match", False)
    qual_score = 0
    if edu_match:
        qual_score += 50
    if domain_match:
        qual_score += 50

    final_score = round(
        (skills_score * 0.40) +
        (exp_score * 0.25) +
        (keyword_score * 0.20) +
        (qual_score * 0.15)
    )

    if final_score >= 80:
        verdict = "Strong match"
    elif final_score >= 65:
        verdict = "Good fit"
    elif final_score >= 45:
        verdict = "Partial match"
    else:
        verdict = "Weak match"

    # Save to history
    db = get_db()
    db.execute("""
        INSERT INTO history (user_email, score, verdict, summary, matched_skills, missing_skills, top_tip)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        current_user,
        final_score,
        verdict,
        data.get("summary", ""),
        json.dumps(data.get("matched_skills", [])),
        json.dumps(data.get("missing_skills", [])),
        data.get("top_tip", "")
    ))
    db.commit()
    db.close()

    return {
        "score": final_score,
        "verdict": verdict,
        "summary": data.get("summary", ""),
        "categories": [
            {"label": "Skills", "score": skills_score},
            {"label": "Experience", "score": exp_score},
            {"label": "Keywords", "score": keyword_score},
            {"label": "Qualifications", "score": qual_score},
        ],
        "matched_skills": data.get("matched_skills", []),
        "missing_skills": data.get("missing_skills", []),
        "top_tip": data.get("top_tip", ""),
        "analyzed_by": current_user
    }

@app.get("/api/history")
def get_history(current_user: str = Depends(get_current_user)):
    db = get_db()
    rows = db.execute("""
        SELECT * FROM history
        WHERE user_email = ?
        ORDER BY created_at DESC
        LIMIT 20
    """, (current_user,)).fetchall()
    db.close()

    history = []
    for row in rows:
        history.append({
            "id": row["id"],
            "score": row["score"],
            "verdict": row["verdict"],
            "summary": row["summary"],
            "matched_skills": json.loads(row["matched_skills"] or "[]"),
            "missing_skills": json.loads(row["missing_skills"] or "[]"),
            "top_tip": row["top_tip"],
            "created_at": row["created_at"]
        })
    return {"history": history}

@app.delete("/api/history/{history_id}")
def delete_history(history_id: int, current_user: str = Depends(get_current_user)):
    db = get_db()
    db.execute("DELETE FROM history WHERE id = ? AND user_email = ?",
               (history_id, current_user))
    db.commit()
    db.close()
    return {"message": "Deleted successfully"}
@app.post("/api/upload-resume")
async def upload_resume(file: UploadFile = File(...), current_user: str = Depends(get_current_user)):
    contents = await file.read()
    text = ""

    if file.filename.endswith(".pdf"):
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            for page in pdf.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"

    elif file.filename.endswith(".docx"):
        doc = docx.Document(io.BytesIO(contents))
        for para in doc.paragraphs:
            if para.text.strip():
                text += para.text + "\n"

    else:
        raise HTTPException(status_code=400, detail="Only PDF and Word (.docx) files are supported")

    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from the file")

    return {"text": text.strip(), "filename": file.filename}