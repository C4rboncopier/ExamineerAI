# ExamineerAI

A comprehensive examination and assessment management platform for educational institutions. ExamineerAI streamlines the full exam lifecycle — from question authoring and exam deployment, to OMR-based automated grading and AI-powered student performance analysis.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript, Vite, React Router DOM, Material UI, KaTeX |
| Backend | Supabase (PostgreSQL, Auth, Storage) |
| AI | Google Gemini API (gemini-2.5-flash-lite / gemini-2.5-flash) |
| OMR Server | Python FastAPI + OpenCV + NumPy |
| Deployment | Vercel (frontend), Docker (OMR server) |

---

## Roles

| Role | Access |
|---|---|
| `admin` | Full institution management, user management, settings |
| `professor` | Subject/question/exam management, OMR scanning, analytics |
| `student` | View enrolled exams, submit answers, view grades and AI analytics |

---

## Features

### For Professors

- **Question Bank** — Create multiple-choice questions with optional images, each linked to course outcomes (CO) and module outcomes (MO) for outcome-based assessment tracking
- **AI Question Variations** — Generate question variants automatically using Google Gemini while preserving the original concept and difficulty
- **Exam Management** — Build exams with multiple question sets (A/B/C/D/E), configurable max attempts, program targeting, and academic year/term settings
- **OMR Scanning** — Grade exams automatically from bubble sheet photos via the OMR server. Supports single image upload, batch ZIP processing, or manual answer entry. Matches scanned sheets to enrolled students by roll number
- **Outcome-Based Analytics** — View class-wide performance broken down by course outcome and module outcome to identify which topics students struggle with most

### For Students

- **Exam Dashboard** — See all enrolled exams with clear status indicators: available, upcoming, locked, or completed
- **Gradebook** — View scores and pass/fail results across all attempts with the date each attempt was submitted
- **AI Analytics** — Request personalized AI feedback (when enabled by the professor) that identifies weak course and module outcomes, explains errors, and provides actionable study tips. A non-AI fallback showing weak area summaries is always available

### For Admins

- **User Management** — Add or edit professor and student accounts and assign them to academic programs
- **Institution Settings** — Configure academic year, semesters, programs list, and the passing rate threshold used across all exams
- **Dashboard** — Organization-wide overview of all exams, subjects, and forms

---

## OMR Pipeline

1. Professor photographs completed bubble sheets
2. Images are sent to the Python FastAPI server (`/scan` for single, `/scan-batch` for ZIP)
3. OpenCV detects filled bubbles using contour analysis with a HoughCircles fallback
4. Answers are extracted per question (A/B/C/D/E) and matched to students by roll number
5. Grading results are saved to Supabase and made available to students once released

---

## AI Analysis

When `ai_analysis_enabled` is toggled on an exam, students can request AI-generated feedback after their grades are released. Powered by **Gemini 2.5 Flash Lite** with structured JSON output, the analysis includes:

- Overall performance summary
- Weak course outcomes and module outcomes identified from wrong answers
- Per-topic study recommendations and coaching tips
- Comparison across multiple attempts (if applicable)

When AI is disabled for an exam, students still see a fallback weak-areas list derived from their answers.
