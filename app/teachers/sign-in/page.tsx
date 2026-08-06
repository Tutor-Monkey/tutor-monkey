"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const errorMessages: Record<string, string> = {
  missing_code: "Google didn't return an authorization code. Please try signing in again.",
  not_configured: "Teachers sign-in isn't configured yet.",
  auth_callback_failed: "We couldn't complete your sign-in. Please try again in a moment.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09 3.98-3.09C6.22 6.86 8.87 4.75 12 4.75z" />
    </svg>
  );
}

export default function TeachersSignInPage() {
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    setErrorKey(new URLSearchParams(window.location.search).get("error"));
  }, []);

  async function handleGoogleSignIn() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStartError("Teachers sign-in isn't configured yet.");
      return;
    }
    setStarting(true);
    setStartError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly",
        },
      });
      if (error) {
        setStartError("Something went wrong starting Google sign-in. Please try again.");
        setStarting(false);
      }
    } catch {
      setStartError("Something went wrong starting Google sign-in. Please try again.");
      setStarting(false);
    }
  }

  const displayError = errorKey ? errorMessages[errorKey] : startError;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 py-12">
      <section className="w-full max-w-sm text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">TutorMonkey Teachers · Beta</p>
        <h1 className="mb-3 font-display text-4xl font-light text-gray-900">Open your dashboard</h1>
        <p className="mb-8 text-base font-light text-gray-600">Sign in with Google to apply for beta access or continue to your workspace.</p>
        {displayError && (
          <div role="alert" className="mb-5 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-light text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {displayError}
          </div>
        )}
        <button type="button" onClick={handleGoogleSignIn} disabled={starting} className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-gray-300 bg-white px-7 py-3.5 text-base font-medium text-gray-900 shadow-sm transition hover:bg-gray-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60">
          <GoogleIcon />
          {starting ? "Redirecting to Google…" : "Continue with Google"}
        </button>
      </section>
    </main>
  );
}
