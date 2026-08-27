import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await getSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        // Check if user has completed onboarding profile
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: patient } = await supabase
            .from("patients")
            .select("id, full_name, date_of_birth, sex")
            .eq("profile_id", user.id)
            .maybeSingle();

          if (!patient || !patient.full_name || (!patient.date_of_birth && !patient.sex)) {
            return NextResponse.redirect(`${origin}/onboarding`);
          }
        }

        const forwardedHost = request.headers.get("x-forwarded-host");
        const isLocalEnv = process.env.NODE_ENV === "development";
        if (isLocalEnv) {
          return NextResponse.redirect(`${origin}${next}`);
        } else if (forwardedHost) {
          return NextResponse.redirect(`https://${forwardedHost}${next}`);
        } else {
          return NextResponse.redirect(`${origin}${next}`);
        }
      }
    }
  }

  // Return user to login with error code if exchange failed
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
