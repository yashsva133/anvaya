"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./supabase/client";

export interface UserProfile {
  id: string;
  role?: "patient" | "doctor" | "admin";
  status?: "active" | "suspended" | "pending_deletion";
  full_name: string | null;
  email: string | null;
  preferred_language: "en" | "hi" | "bn";
}

export interface PatientRecord {
  id?: string;
  profile_id?: string;
  full_name: string;
  name_local_script?: string;
  date_of_birth?: string | null;
  age?: number;
  sex?: "male" | "female" | "other" | "unspecified" | null;
  phone?: string;
  email?: string;
  preferred_language?: "en" | "hi" | "bn";
  reading_level?: "simple" | "standard" | "detailed";
  voice_enabled?: boolean;
  health_focus?: string[];
}

export interface OnboardingPayload {
  fullName: string;
  age?: number;
  dateOfBirth?: string;
  gender: "male" | "female" | "other" | "unspecified";
  preferredLanguage: "en" | "hi" | "bn";
  readingLevel?: "simple" | "standard" | "detailed";
  voiceEnabled?: boolean;
  healthFocus?: string[];
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  patient: PatientRecord | null;
  loading: boolean;
  isOnboarded: boolean;
  isConfigured: boolean;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithEmail: (
    email: string,
    password: string,
    fullName?: string
  ) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  saveOnboarding: (data: OnboardingPayload) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const DEMO_USER_KEY = "anvaya_demo_session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const isConfigured = isSupabaseConfigured();

  const fetchUserData = useCallback(async (userId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    try {
      // 1. Fetch Profile
      const { data: profData } = await supabase
        .from("profiles")
        .select("id, role, status, full_name, email, preferred_language")
        .eq("id", userId)
        .maybeSingle();

      if (profData) {
        setProfile(profData as UserProfile);
      }

      // 2. Fetch Patient Record
      const { data: patData } = await supabase
        .from("patients")
        .select(
          "id, profile_id, full_name, name_local_script, date_of_birth, sex, phone, email, preferred_language, reading_level, voice_enabled"
        )
        .eq("profile_id", userId)
        .maybeSingle();

      if (patData) {
        setPatient(patData as PatientRecord);
        const hasRequired = Boolean(
          patData.full_name &&
            (patData.sex || patData.date_of_birth) &&
            patData.preferred_language
        );
        setIsOnboarded(hasRequired);
      } else {
        setPatient(null);
        setIsOnboarded(false);
      }
    } catch (err) {
      console.warn("Error fetching user profile/patient from Supabase:", err);
    }
  }, []);

  const initAuth = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      // Real Supabase session
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        setUser(session.user);
        await fetchUserData(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setPatient(null);
        setIsOnboarded(false);
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(async (_event: any, session: any) => {
        if (session?.user) {
          setUser(session.user);
          await fetchUserData(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
          setPatient(null);
          setIsOnboarded(false);
        }
        setLoading(false);
      });

      setLoading(false);
      return () => subscription.unsubscribe();
    } else {
      // Fallback dev mode (when Supabase env variables are not supplied)
      if (typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(DEMO_USER_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            setUser(parsed.user || null);
            setProfile(parsed.profile || null);
            setPatient(parsed.patient || null);
            setIsOnboarded(Boolean(parsed.isOnboarded));
          }
        } catch {
          // ignore
        }
      }
      setLoading(false);
    }
  }, [fetchUserData]);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchUserData(user.id);
    }
  }, [user, fetchUserData]);

  // Sign In with Email
  const signInWithEmail = async (email: string, password: string) => {
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        setUser(data.user);
        await fetchUserData(data.user.id);
      }
      return { error: null };
    }

    // Mock dev mode fallback
    const mockUser: User = {
      id: "mock-user-" + Math.random().toString(36).substring(2, 9),
      app_metadata: {},
      user_metadata: { full_name: email.split("@")[0] },
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email: email.trim().toLowerCase(),
    };

    const mockProfile: UserProfile = {
      id: mockUser.id,
      role: "patient",
      status: "active",
      full_name: email.split("@")[0],
      email: mockUser.email || null,
      preferred_language: "en",
    };

    setUser(mockUser);
    setProfile(mockProfile);
    setIsOnboarded(false);

    if (typeof window !== "undefined") {
      localStorage.setItem(
        DEMO_USER_KEY,
        JSON.stringify({
          user: mockUser,
          profile: mockProfile,
          patient: null,
          isOnboarded: false,
        })
      );
    }

    return { error: null };
  };

  // Sign Up with Email
  const signUpWithEmail = async (
    email: string,
    password: string,
    fullName?: string
  ) => {
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: fullName?.trim(),
          },
          emailRedirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback`,
        },
      });

      if (error) {
        return { error: error.message };
      }

      // Check if session exists immediately (e.g., auto-confirm is enabled)
      if (data.session?.user) {
        setUser(data.session.user);
        await fetchUserData(data.session.user.id);
        return { error: null, needsEmailConfirmation: false };
      }

      if (data.user && !data.session) {
        return { error: null, needsEmailConfirmation: true };
      }

      return { error: null };
    }

    // Mock dev mode fallback
    const mockUser: User = {
      id: "mock-user-" + Math.random().toString(36).substring(2, 9),
      app_metadata: {},
      user_metadata: { full_name: fullName || email.split("@")[0] },
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email: email.trim().toLowerCase(),
    };

    const mockProfile: UserProfile = {
      id: mockUser.id,
      role: "patient",
      status: "active",
      full_name: fullName || email.split("@")[0],
      email: mockUser.email || null,
      preferred_language: "en",
    };

    setUser(mockUser);
    setProfile(mockProfile);
    setIsOnboarded(false);

    if (typeof window !== "undefined") {
      localStorage.setItem(
        DEMO_USER_KEY,
        JSON.stringify({
          user: mockUser,
          profile: mockProfile,
          patient: null,
          isOnboarded: false,
        })
      );
    }

    return { error: null, needsEmailConfirmation: false };
  };

  // Sign In with Google OAuth
  const signInWithGoogle = async () => {
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) {
        return { error: error.message };
      }
      return { error: null };
    }

    // Mock fallback
    const mockUser: User = {
      id: "mock-google-" + Math.random().toString(36).substring(2, 9),
      app_metadata: { provider: "google" },
      user_metadata: { full_name: "Google User" },
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email: "google.user@example.com",
    };

    const mockProfile: UserProfile = {
      id: mockUser.id,
      role: "patient",
      status: "active",
      full_name: "Google User",
      email: "google.user@example.com",
      preferred_language: "en",
    };

    setUser(mockUser);
    setProfile(mockProfile);
    setIsOnboarded(false);

    if (typeof window !== "undefined") {
      localStorage.setItem(
        DEMO_USER_KEY,
        JSON.stringify({
          user: mockUser,
          profile: mockProfile,
          patient: null,
          isOnboarded: false,
        })
      );
    }

    return { error: null };
  };

  // Reset Password
  const resetPassword = async (email: string) => {
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: `${origin}/login?mode=reset`,
        }
      );

      if (error) {
        return { error: error.message };
      }
      return { error: null };
    }

    return { error: null };
  };

  // Sign Out
  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      await supabase.auth.signOut();
    }

    setUser(null);
    setProfile(null);
    setPatient(null);
    setIsOnboarded(false);

    if (typeof window !== "undefined") {
      localStorage.removeItem(DEMO_USER_KEY);
    }
  };

  // Save Onboarding
  const saveOnboarding = async (payload: OnboardingPayload) => {
    if (!user) {
      return { error: "You must be logged in to complete onboarding." };
    }

    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      try {
        // 1. Update Profile
        await supabase
          .from("profiles")
          .update({
            full_name: payload.fullName.trim(),
            preferred_language: payload.preferredLanguage,
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);

        // 2. Compute date_of_birth if age is given
        let dob = payload.dateOfBirth || null;
        if (!dob && payload.age) {
          const year = new Date().getFullYear() - payload.age;
          dob = `${year}-01-01`;
        }

        // 3. Upsert Patient
        const patientData = {
          profile_id: user.id,
          full_name: payload.fullName.trim(),
          sex: payload.gender,
          date_of_birth: dob,
          preferred_language: payload.preferredLanguage,
          reading_level: payload.readingLevel || "standard",
          voice_enabled: payload.voiceEnabled !== undefined ? payload.voiceEnabled : true,
          email: user.email || null,
          updated_at: new Date().toISOString(),
        };

        const { data: savedPatient, error: patError } = await supabase
          .from("patients")
          .upsert(patientData, { onConflict: "profile_id" })
          .select()
          .single();

        if (patError) {
          console.error("Failed to save patient record:", patError);
          return { error: patError.message };
        }

        setPatient(savedPatient as PatientRecord);
        setIsOnboarded(true);
        await fetchUserData(user.id);
        return { error: null };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to save profile";
        return { error: message };
      }
    }

    // Mock dev mode fallback
    const updatedPatient: PatientRecord = {
      profile_id: user.id,
      full_name: payload.fullName,
      sex: payload.gender,
      age: payload.age || 42,
      preferred_language: payload.preferredLanguage,
      reading_level: payload.readingLevel || "standard",
      voice_enabled: payload.voiceEnabled ?? true,
      health_focus: payload.healthFocus || [],
      email: user.email || undefined,
    };

    const updatedProfile: UserProfile = {
      id: user.id,
      role: "patient",
      status: "active",
      full_name: payload.fullName,
      email: user.email || null,
      preferred_language: payload.preferredLanguage,
    };

    setPatient(updatedPatient);
    setProfile(updatedProfile);
    setIsOnboarded(true);

    if (typeof window !== "undefined") {
      localStorage.setItem(
        DEMO_USER_KEY,
        JSON.stringify({
          user,
          profile: updatedProfile,
          patient: updatedPatient,
          isOnboarded: true,
        })
      );
    }

    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        patient,
        loading,
        isOnboarded,
        isConfigured,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        resetPassword,
        signOut,
        saveOnboarding,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: null,
      profile: null,
      patient: null,
      loading: false,
      isOnboarded: true,
      isConfigured: false,
      signInWithEmail: async () => ({ error: null }),
      signUpWithEmail: async () => ({ error: null, session: null }),
      signInWithGoogle: async () => ({ error: null }),
      resetPassword: async () => ({ error: null }),
      signOut: async () => {},
      saveOnboarding: async () => ({ error: null }),
      refreshProfile: async () => {},
    };
  }
  return context;
}
