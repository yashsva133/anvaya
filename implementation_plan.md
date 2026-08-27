# ANVAYA: Landing Page, Authentication & Onboarding Implementation Plan

Improve the existing ANVAYA medical report understanding application by adding a modern, responsive **Landing Page**, real **Supabase Authentication** (Email/Password + Google OAuth + Password Reset), and a persistent **First-time Onboarding Flow**, while protecting app routes and preserving all existing prototype capabilities.

---

## User Review Required

> [!IMPORTANT]
> **Supabase Integration & Environment Variables**:
> Real backend authentication and profile persistence will use Supabase Auth and PostgreSQL tables (`profiles`, `patients`).
> To connect to your Supabase project, set the following in `.env.local`:
> ```env
> NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
> NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
> ```
> If these variables are not configured yet, the app includes a graceful fallback mode with mock auth testing so the UI and flows can be previewed without crashing.

---

## Proposed Changes

### 1. Dependencies & Supabase Backend Client

Install `@supabase/supabase-js` and `@supabase/ssr` to support browser and server-side Supabase authentication.

#### [NEW] [src/lib/supabase/client.ts](file:///c:/Users/jonty/Downloads/anvaya-main/anvaya-main/src/lib/supabase/client.ts)
- Browser Supabase client helper using `createBrowserClient` with safe null checking for missing env variables.

#### [NEW] [src/lib/supabase/server.ts](file:///c:/Users/jonty/Downloads/anvaya-main/anvaya-main/src/lib/supabase/server.ts)
- Server-side Supabase client using Next.js `cookies()`.

#### [NEW] [src/app/auth/callback/route.ts](file:///c:/Users/jonty/Downloads/anvaya-main/anvaya-main/src/app/auth/callback/route.ts)
- OAuth callback route handler to exchange auth code for session cookies and redirect to `/onboarding` or `/dashboard`.

---

### 2. Authentication Context & State Management

#### [NEW] [src/lib/auth.tsx](file:///c:/Users/jonty/Downloads/anvaya-main/anvaya-main/src/lib/auth.tsx)
- React Auth context (`AuthProvider`, `useAuth`) managing:
  - `user`: Supabase `User | null`
  - `profile`: Record from `public.profiles` (`id`, `full_name`, `email`, `preferred_language`, `role`)
  - `patient`: Record from `public.patients` (`full_name`, `sex`, `date_of_birth`/`age`, `preferred_language`, `reading_level`, `voice_enabled`)
  - `isOnboarded`: Boolean check whether user has completed name, age/birthdate, and gender
  - `signInWithEmail(email, password)`
  - `signUpWithEmail(email, password, fullName)`
  - `signInWithGoogle()`
  - `resetPassword(email)`
  - `signOut()`
  - `saveOnboarding(data)` -> Persists profile to Supabase `profiles` & `patients`
- Listens to `onAuthStateChange` to keep session updated in real time.

#### [MODIFY] [src/components/providers.tsx](file:///c:/Users/jonty/Downloads/anvaya-main/anvaya-main/src/components/providers.tsx)
- Wrap `AuthProvider` around the app hierarchy alongside `I18nProvider` and `ToastProvider`.

---

### 3. Landing Page (`/`)

#### [MODIFY] [src/app/page.tsx](file:///c:/Users/jonty/Downloads/anvaya-main/anvaya-main/src/app/page.tsx)
- Transform `/` into a comprehensive, high-conversion landing page:
  - **Responsive Navbar**:
    - Logo + Tagline
    - Navigation links (Features, How it works, Doctor summary, Benefits)
    - Language switcher (EN / हिन्दी)
    - Auth CTAs: **Log in** (to `/login`) and **Get Started** (to `/login?mode=signup` or `/welcome`)
    - Mobile hamburger drawer for small screens (375px/390px/430px)
  - **Hero Section**:
    - Medical report understanding & personalized health insights for Indian patients
    - CTAs: Primary "Get Started" + Secondary "Log in" / "See Demo"
    - Interactive card mockup showing report parameters with clear status indicators and audio readout
    - Trust badges: Private by design, cited medical sources (MedlinePlus/CDC), multilingual
  - **3-Step "How It Works" Section**:
    - Step 1: **Upload** (Photos, scans, PDFs of Indian lab reports)
    - Step 2: **Analyze** (Vision AI, clinical catalogue lookup, pattern recognition)
    - Step 3: **Insights** (Simple words, audio explanations, trends, doctor summary)
  - **Core Benefits & Features Grid**:
    - Clinically Grounded & Cited Sources
    - Native Indian Languages & Audio First
    - Track Changes Over Time & Correlate Tests
    - Family & Doctor Sharing
  - **Security & Privacy Commitment**:
    - Explaining client-side privacy, HIPAA/ABDM-style data isolation
  - **Healthcare Disclaimer & Footer**:
    - Prominent clinical disclaimer banner + statutory notes

---

### 4. Authentication Page (`/login`)

#### [NEW] [src/app/login/page.tsx](file:///c:/Users/jonty/Downloads/anvaya-main/anvaya-main/src/app/login/page.tsx)
- Beautiful, accessible authentication screen supporting:
  - Mode switching between **Sign In**, **Sign Up**, and **Forgot Password**
  - **"Continue with Google"** OAuth button
  - Email + Password inputs with clear validation (email format, min 6 char password, matching confirm password)
  - Password visibility toggle
  - Error messages with actionable feedback
  - Loading indicators during submission
  - Redirect handling (`redirect` search param, auto-redirect if already authenticated)

---

### 5. First-Time Onboarding Flow (`/onboarding`)

#### [NEW] [src/app/onboarding/page.tsx](file:///c:/Users/jonty/Downloads/anvaya-main/anvaya-main/src/app/onboarding/page.tsx)
- Multi-step guided setup for new users after login:
  - **Step 1: Patient Profile**:
    - Full Name
    - Age / Date of Birth
    - Biological Sex (`Male`, `Female`, `Other`)
    - Preferred Language (`English`, `हिन्दी`, `বাংলা`)
  - **Step 2: Health Focus & Accessibility**:
    - Areas of focus (Blood Sugar / Diabetes, Lipid & Heart, CBC & Anemia, Thyroid, General Checkup)
    - Voice readout preference (Audio explanations on/off)
    - Reading preference (`Simple Mode` vs `Detailed Clinical Mode`)
  - Form validation with inline hints
  - Saves directly to persistent backend (`public.profiles` & `public.patients`)
  - Once saved, sets onboarding complete and transitions smoothly to `/dashboard`
  - If a returning user already has a complete profile, `/onboarding` automatically redirects to `/dashboard`

---

### 6. App Shell & Route Protection

#### [MODIFY] [src/components/shell.tsx](file:///c:/Users/jonty/Downloads/anvaya-main/anvaya-main/src/components/shell.tsx)
- Update desktop sidebar and mobile header:
  - Display authenticated patient name and initials (or fallback to demo patient if guest)
  - Add quick **Log out** button in sidebar footer / settings menu
  - Update `HomeNav` to include **Log in** and **Get Started** buttons with mobile hamburger support

#### [NEW] [src/components/auth-guard.tsx](file:///c:/Users/jonty/Downloads/anvaya-main/anvaya-main/src/components/auth-guard.tsx)
- Client-side auth guard wrapping protected routes:
  - Checks if user is authenticated; if not, redirects to `/login?redirect=<path>`
  - Checks if onboarding is required; if so, redirects to `/onboarding`
  - Renders a clean loading skeleton while verifying auth status

---

## Verification Plan

### Automated Checks
- `npm run lint`: Ensure zero ESLint errors or warnings
- `npm run typecheck`: Ensure TypeScript compile is completely clean with 0 errors
- `npm run build`: Verify Next.js production build succeeds without issues

### Manual & Flow Verification
1. **Landing Page**:
   - Test responsive layout on Desktop (1440px), Tablet (768px), and Mobile devices (375px, 390px, 430px)
   - Test language switcher on landing page (EN / हिन्दी)
   - Test mobile menu hamburger open/close
   - Test all CTA buttons (Get Started -> `/login?mode=signup`, Log in -> `/login`)
2. **Authentication Flow**:
   - Sign up with new email & password
   - Test validation errors (empty fields, short passwords, invalid emails)
   - Test Continue with Google button
   - Test Forgot Password flow
3. **Onboarding Flow**:
   - Verify new user lands on `/onboarding`
   - Complete Step 1 and Step 2 and verify submission transitions to `/dashboard`
   - Verify returning user with completed profile goes straight to `/dashboard`
4. **Existing App Features**:
   - Verify report upload (`/upload`), processing (`/processing`), dashboard (`/dashboard`), test detail (`/test/hemoglobin`), trends (`/trends`), AI insights (`/insights`), ask AI (`/ask`), and doctor summary (`/doctor`) function properly without regression
