from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from groq import Groq
import os
import json

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

class AnalyzeRequest(BaseModel):
    resume: str
    jd: str

@app.get("/health")
def health():
    return {"status": "ok", "message": "Resume Matcher API is running"}

@app.post("/api/analyze")
def analyze(request: AnalyzeRequest):
    prompt = f"""You are a resume-job fit analyzer. Analyze the resume and job description below.
Respond ONLY with a JSON object — no explanation, no markdown fences.

JSON shape:
{{
  "score": <integer 0-100>,
  "verdict": "<Strong match / Good fit / Partial match / Weak match>",
  "summary": "<2 sentence summary of fit>",
  "categories": [
    {{"label": "Skills", "score": <0-100>}},
    {{"label": "Experience", "score": <0-100>}},
    {{"label": "Keywords", "score": <0-100>}},
    {{"label": "Qualifications", "score": <0-100>}}
  ],
  "matched_skills": ["skill1", "skill2"],
  "missing_skills": ["skill1", "skill2"],
  "top_tip": "<one actionable sentence to improve the match>"
}}

Resume:
{request.resume}

Job Description:
{request.jd}"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1000,
        temperature=0.3
    )

    result = json.loads(response.choices[0].message.content)
    return result