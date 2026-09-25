# Contributing to RxAnvaya

Thank you for your interest in contributing to **RxAnvaya**! We are building open-source medical report intelligence and patient communication tools to make laboratory healthcare data clear, accessible, and understandable for millions in their native languages.

RxAnvaya is developed and maintained by **Team Anvaya**.

---

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Clinical Safety & Guardrails](#clinical-safety--guardrails)
- [Development Workflow](#development-workflow)
  - [Prerequisites](#prerequisites)
  - [Initial Setup](#initial-setup)
  - [Running the App](#running-the-app)
- [Project Architecture](#project-architecture)
- [Testing & Quality Gates](#testing--quality-gates)
- [Submitting Changes](#submitting-changes)
  - [Branch Naming](#branch-naming)
  - [Commit Messages](#commit-messages)
  - [Pull Requests](#pull-requests)
- [License](#license)

---

## Code of Conduct
All contributors and maintainers are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please report unacceptable behavior through our security contact.

---

## Clinical Safety & Guardrails

RxAnvaya operates in the healthcare domain. All contributions that touch report parsing, AI responses, or clinical translations **must** uphold our safety principles:

1. **Zero Fabrication / Non-Hallucination**:
   - Numerical test values, units, and reference ranges must be extracted verbatim from the uploaded document or clinical catalog.
   - The application must never fabricate lab values or assume unassessed markers are "normal".
2. **Educational Nature**:
   - All AI insights are educational aids for patients and providers; they are never definitive clinical diagnoses or prescription recommendations.
3. **Medical Provenance & Evidence Citation**:
   - Every definition and explanation must trace back to vetted medical evidence (e.g., MedlinePlus, CDC, ICMR, WHO, AHA).
4. **Privacy & Anonymization (ABDM / HIPAA alignment)**:
   - Patient identifiable information (name, address, MRN, phone) is anonymized before passing to external inference backends. Never commit credentials or personal health data (PHI).

---

## Development Workflow

### Prerequisites
- **Node.js**: v18.18.0 or v20.x+ (Node 22 recommended)
- **npm**: v9+ or v10+
- **Python**: 3.10+ (for PaddleOCR engine, optional if testing mock/web mode)
- **Git**

### Initial Setup

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/yashsva133/anvaya.git
   cd anvaya
   ```

2. **Install Node dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   ```bash
   cp .env.example .env.local
   ```
   *Note: RxAnvaya includes built-in offline rules and mock modes so the entire application runs locally even without active external API keys.*

4. **(Optional) Setup Python Virtual Environment for PaddleOCR:**
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   pip install -r requirements.txt
   ```

### Running the App

```bash
# Start Next.js development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the application.

---

## Project Architecture

```
rx-anvaya/
├── src/
│   ├── app/                 # Next.js App Router (pages & REST API routes)
│   │   ├── api/             # API routes: /answer, /process-report, /insights, etc.
│   │   ├── dashboard/       # Patient health dashboard
│   │   ├── reports/         # Historical reports browser
│   │   ├── upload/          # PDF/Image/CSV report ingestion
│   │   ├── ask/             # Multilingual AI companion chat
│   │   ├── voice/           # Voice agent interface
│   │   └── trends/          # Longitudinal parameter trend charts
│   ├── components/          # Reusable UI components & application shell
│   ├── context/             # Global React state (ReportDataContext, Auth)
│   └── lib/                 # Core business logic:
│       ├── ai/              # Medical agents, guardrails, translation bridge, RAG
│       ├── supabase/        # Database clients and schema queries
│       └── voice/           # Web Speech API and audio synthesis
├── db/                      # Supabase / PostgreSQL schemas and migrations
├── samples/                 # Sample anonymized lab reports for testing
└── scripts/                 # Automated test runners and mock servers
```

---

## Testing & Quality Gates

Before opening a pull request, verify that all three quality gates pass:

```bash
# 1. Type Check
npm run typecheck

# 2. Linter (ESLint 9)
npm run lint

# 3. Unit & Integration Tests (35+ clinical tests)
npm test

# 4. Production Build Verification
npm run build
```

---

## Submitting Changes

### Branch Naming
- `feature/description` for new features
- `fix/description` for bug fixes
- `docs/description` for documentation improvements
- `refactor/description` for code refactoring

### Commit Messages
We follow conventional commit guidelines:
```
feat(ai): add bilingual support for kidney panel definitions
fix(ocr): preserve trailing decimals in platelet count parsing
docs(readme): add architecture flowchart and quickstart guide
```

### Pull Requests
1. Ensure your branch is rebased on `main`.
2. Fill out the [Pull Request Template](.github/pull_request_template.md).
3. Confirm all tests, linter, and build steps pass locally.
4. Request a review from the maintainers.

---

## License
By contributing to RxAnvaya, you agree that your contributions will be licensed under the [MIT License](LICENSE).
