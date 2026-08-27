-- ANVAYA onboarding completion flag for first-time-user routing.
-- The profile row is still 1:1 with auth.users; RLS in 0018 already limits
-- reads/updates to the owning authenticated user.
alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

comment on column public.profiles.onboarding_completed is
  'True only after the patient completes the one-time ANVAYA onboarding/profile setup. Used to route returning users directly to the app.';
