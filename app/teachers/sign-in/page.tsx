"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { ArrowLeft, ShieldCheck, AlertCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const errorMessages: Record<string, string> = {
  missing_code:
    "Google didn't return an authorization code. Please try signing in again.",
  not_configured:
    "Teachers sign-in isn't configured yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable it.",
  auth_callback_failed:
    "We couldn't complete your sign-in. Please try again in a moment.",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

export default function TeachersSignInPage() {
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Read the ?error= param client-side so we avoid useSearchParams'
  // Suspense requirement during prerendering.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) setErrorKey(error);
  }, []);

  const supabase = getSupabaseBrowserClient();

  async function handleGoogleSignIn() {
    if (!supabase) {
      setStartError(
        "Teachers sign-in isn't configured yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable it.",
      );
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
        setStartError(
          "Something went wrong starting Google sign-in. Please try again.",
        );
        setStarting(false);
      }
      // On success supabase-js redirects the browser to Google; no further
      // state changes happen here.
    } catch {
      setStartError(
        "Something went wrong starting Google sign-in. Please try again.",
      );
      setStarting(false);
    }
  }

  const displayError = errorKey ? errorMessages[errorKey] : startError;

  return (
    <main className="min-h-screen bg-white">
      <Navigation />

      <section className="pt-36 pb-24 px-6">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-10 animate-fade-in-up">
            <p className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-sm font-medium text-gray-600 mb-6">
              TutorMonkey Teachers
            </p>
            <h1 className="text-4xl md:text-5xl font-light text-gray-900 mb-4 font-display text-balance">
              Sign in to your workspace
            </h1>
            <p className="text-lg text-gray-600 font-light">
              Use your Google account — no password to remember.
            </p>
          </div>

          {displayError && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-fade-in"
            >
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="font-light">{displayError}</p>
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm animate-fade-in-up animation-delay-200">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={starting}
              className="group inline-flex w-full items-center justify-center gap-3 rounded-full border border-gray-300 bg-white px-7 py-3.5 text-base font-medium text-gray-900 shadow-sm transition-all duration-300 hover:bg-gray-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleIcon />
              {starting ? "Redirecting to Google…" : "Continue with Google"}
            </button>

            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400 font-light">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Secured by Google OAuth — we never see your password.
            </div>
          </div>

          <div className="mt-6 text-center animate-fade-in-up animation-delay-400">
            <Link
              href="/teachers"
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Teachers
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
