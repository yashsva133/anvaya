# 🩺 ANVAYA (RxAnvaya) — Patient-First Medical Lab Intelligence

> **Translating complex laboratory diagnostics into actionable, multilingual, and plain-language health intelligence for Indian patients and doctors.**

[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Database%20%26%20Auth-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![Python OCR](https://img.shields.io/badge/Python-RapidOCR%20%2F%20ONNX-3776AB?style=for-the-badge&logo=python)](https://github.com/RapidAI/RapidOCR)
[![MedGemma](https://img.shields.io/badge/AI-MedGemma%20%2B%20RAG-FF6F00?style=for-the-badge)](https://huggingface.co/google/medgemma-4b-it)

---

## 🌟 Overview & Problem Statement

Pathology and diagnostic reports are the foundation of modern healthcare, yet **over 80% of patients cannot understand their own test results**. Dense clinical terminology, varying units (`g/dL`, `cumm`, `mg/dL`), and differing reference intervals cause confusion, anxiety, and delays in seeking medical attention.

**ANVAYA** bridges this gap:
1. **Reads Any Report**: Digitizes printed, photographed, or PDF lab reports on-device using a lightweight multi-engine OCR pipeline.
2. **Deterministic Clinical Standard**: Normalizes units and validates test results against **ICMR (Indian Council of Medical Research)** and **WHO** reference intervals.
3. **Multilingual & Multi-Literacy Explanations**: Converts clinical findings into 3 reading tiers (*Standard*, *Simple*, *Very Simple*) in **English, Hindi, and Bengali**.
4. **Longitudinal Health Tracking**: Tracks historical parameters over time to detect emergent clinical patterns (e.g. *Iron Deficiency Anemia*, *Diabetic Dyslipidemia*).
5. **Medical AI & Voice Assistant**: Answers patient queries safely via **MedGemma RAG**, grounded in verified medical sources with an interactive voice interface.

---

## 🚀 Key Features

### 1. 📄 Intelligent Multi-Engine OCR & Clinical Ingestion
- Accepts **PDFs, camera captures, and image uploads**.
- Powered by `rapidocr-onnxruntime` (PaddleOCR PP-OCRv4 ONNX engine) for fast CPU execution on all Python versions (3.8–3.14+).
- Normalizes unit variations (`gm/dl` → `g/dL`, `lakh/cumm` → `/cumm`).
- Resolves abbreviations in parenthetical titles (e.g. `Hemoglobin (Hb)`, `Packed Cell Volume (PCV)`, `Mean Corpuscular Volume (MCV)`).

### 2. 📅 Date-Aware Historical Persistence
- Interactive **Report Collection Date Picker** on verification.
- Auto-syncs with **Supabase PostgreSQL** (`lab_reports` & `test_results`).
- Persistent user sessions: logging in automatically restores all previous reports, cards, and trends without re-uploading.

### 3. 📊 Longitudinal Trends & Pattern Recognition
- Interactive Recharts graphs showing biomarker progression over time.
- Identifies multi-parameter clinical patterns (e.g., *Low Hb + Low MCV + High RDW* = Microcytic Anemia pattern).

### 4. 🎙️ Multilingual Voice & AI Health Assistant
- Conversational assistant powered by **MedGemma** and clinical rules.
- Grounded in verified reference sources (**MedlinePlus**, **ICMR Guidelines**, **WHO Guidelines**).
- Natural voice playback and speech recognition in **English, Hindi, and Bengali**.

### 5. 👨‍⚕️ Doctor Clinical Review Portal
- Side-by-side view comparing raw laboratory outputs with plain-language patient explanations.
- Enables clinicians to review findings, write doctor notes, and confirm diagnoses.

---

## 🏗️ System Architecture

```
                               ┌──────────────────────────────────────────────┐
                               │           FRONTEND (Next.js 14 / React)      │
                               │  Tailwind CSS • Framer Motion • Web Speech   │
                               └──────────────────────┬───────────────────────┘
                                                      │
                                   ┌──────────────────┴──────────────────┐
                                   ▼                                     ▼
                      ┌──────────────────────────┐          ┌──────────────────────────┐
                      │    NEXT.JS API ROUTES    │          │    SUPABASE DATABASE     │
                      │  • /api/process-report   │          │  • profiles  • lab_reports│
                      │  • /api/save-report      │          │  • patients  • test_results│
                      │  • /api/delete-report    │          │  • catalog   • rag_sources│
                      │  • /api/answer (MedGemma)│          │  (PostgreSQL + Row RLS)  │
                      └────────────┬─────────────┘          └──────────────────────────┘
                                   │
                                   ▼
                      ┌──────────────────────────┐
                      │    LOCAL OCR PIPELINE    │
                      │   lab_ocr_paddleocr.py   │
                      │ (RapidOCR ONNX Runtime)  │
                      └──────────────────────────┘
```

---

## 📂 Project Structure

```
anvaya/
├── backend/                  # Standalone Express backend services & controllers
│   ├── controllers/          # Patient, Report & Trends controllers
│   ├── middleware/           # Rate limiting, auth & error handlers
│   ├── routes/               # Express REST routes
│   └── server.js             # Express entry point
├── db/                       # Supabase PostgreSQL schema & migrations
│   ├── migrations/           # 0001–0021 SQL migration sequence
│   ├── anvaya_schema.sql     # Single-file idempotent Supabase schema
│   └── ANVAYA_DATABASE_SPEC.md # Full database specifications
├── public/                   # Static assets, icons, and clinical illustrations
├── scripts/                  # Seeders, mock servers, and test harnesses
├── src/                      # Next.js 14 App Router application
│   ├── app/                  # Application pages & API routes
│   │   ├── (auth)/login/     # Supabase Auth login & sign-up
│   │   ├── onboarding/       # Patient health demographic setup
│   │   ├── upload/           # File drag-and-drop ingestion
│   │   ├── scan/             # Live camera capture interface
│   │   ├── processing/       # Animated 5-stage pipeline review
│   │   ├── extracted/        # Parameter confirmation & date selector
│   │   ├── dashboard/        # Main patient health overview & flagged cards
│   │   ├── reports/          # Historical report cards & list
│   │   ├── trends/           # Recharts multi-report trend graphs
│   │   ├── ask/              # MedGemma AI conversational assistant
│   │   ├── doctor/           # Doctor verification & notes portal
│   │   └── api/              # Backend Next.js route handlers
│   ├── components/           # Reusable UI shells, cards, pills & icons
│   ├── context/              # ReportDataContext & global state providers
│   └── lib/                  # Auth, i18n, Supabase clients & clinical data
├── lab_ocr_paddleocr.py      # Multi-engine Python OCR script (RapidOCR / PaddleOCR)
├── package.json              # Node.js dependencies & scripts
├── requirements.txt          # Python OCR dependencies
└── .env.local                # Local environment configuration (Git-ignored)
```

---

## 🗄️ Database Schema & Entities

All tables are secured with PostgreSQL **Row Level Security (RLS)**:

| Table | Description |
| :--- | :--- |
| **`profiles`** | User account identity, preferred language (`en`, `hi`, `bn`), and reading level. |
| **`patients`** | Medical PII record linked to user (`full_name`, `date_of_birth`, `sex`, `abha_id`). |
| **`lab_test_catalog`** | Master catalog of 20+ clinical tests with bilingual descriptions and clinical categories. |
| **`reference_ranges`** | Standard ICMR/WHO reference intervals by test, age, and sex. |
| **`lab_reports`** | Diagnostic reports (`collected_on`, `lab_name`, `status`, `notes`). |
| **`test_results`** | Extracted parameter readings, units, status (`normal`, `high`, `low`, `borderline`), and confidence scores. |
| **`rag_sources`** | Citations and excerpts from ICMR, WHO, and MedlinePlus. |
| **`doctor_reviews`** | Clinical reviews and validation notes by physicians. |

---

## ⚡ Quickstart & Installation

### Prerequisites
- **Node.js**: v18.0 or higher
- **Python**: v3.8 through 3.14+
- **Supabase Account**: (Free tier)

### 1. Clone the Repository
```bash
git clone https://github.com/Tushar-Khilwani/anvaya.git
cd anvaya
```

### 2. Install Node Dependencies
```bash
npm install
```

### 3. Install Python OCR Dependencies
```bash
pip install -r requirements.txt
# OR manually:
pip install rapidocr-onnxruntime opencv-python numpy python-dateutil pdf2image
```

### 4. Configure Environment Variables
Create a `.env.local` file in the root directory:
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# AI / MedGemma Inference (Optional / Local Ollama)
AI_PROVIDER=ollama
AI_BASE_URL=http://127.0.0.1:11434
AI_MODEL=medgemma:4b
```

### 5. Start the Development Server
```bash
npm run dev
```
Open **`http://localhost:3000`** in your browser.

---

## 🧪 Tech Stack Summary

- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS, Framer Motion, Lucide Icons, Recharts.
- **Backend / APIs**: Next.js Serverless Routes, Node.js, Express.js.
- **Database & Auth**: Supabase PostgreSQL, Row-Level Security (RLS), Supabase Auth SSR.
- **OCR Engine**: RapidOCR (PaddleOCR ONNX runtime), OpenCV, NumPy.
- **Medical AI**: MedGemma 4B / Ollama, MedlinePlus / ICMR RAG Pipeline.
- **Voice & Accessibility**: Web Speech API (SpeechRecognition + SpeechSynthesis).

---

## 🏆 Hackathon Impact & Vision

In India, healthcare accessibility is challenged by regional language barriers and medical literacy divides. **ANVAYA** empowers over 1.4 billion citizens to:
- **Understand their health** in their native language (*Hindi, Bengali, English*).
- **Detect preventable conditions early** through longitudinal trend tracking.
- **Engage in informed conversations** with their doctors.

---

## 👥 Team & License

Built with ❤️ for **SIH 2026 / Hackathon 2026**.  
Licensed under the **MIT License**.
