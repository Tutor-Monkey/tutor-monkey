"use client";

import { FormEvent, useEffect, useState } from "react";
import { Clock3, Send, XCircle } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type ApprovalStatus = "pending" | "approved" | "rejected";

type BetaApplicationGateProps = {
  userId: string;
  email: string | null;
  onApproved: () => void;
};

export function BetaApplicationGate({ userId, email, onApproved }: BetaApplicationGateProps) {
  const [status, setStatus] = useState<ApprovalStatus | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Sign-in is unavailable right now.");
      setLoading(false);
      return;
    }

    void supabase
      .from("teacher_profiles")
      .select("approval_status, application_message")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) {
          setError("Beta access is not configured yet. Please try again soon.");
        } else {
          setStatus((data?.approval_status as ApprovalStatus | null) ?? "pending");
          setMessage(typeof data?.application_message === "string" ? data.application_message : "");
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (status === "approved") onApproved();
  }, [onApproved, status]);

  if (loading) {
    return (
      <main className="flex h-dvh items-center justify-center bg-gray-50 px-6 text-gray-500">
        <div className="flex items-center gap-3 text-sm font-light"><Clock3 className="h-5 w-5 animate-pulse" /> Checking beta access…</div>
      </main>
    );
  }

  if (status === "approved") {
    return null;
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setSubmitting(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("teacher_profiles")
      .update({
        approval_status: "pending",
        application_message: message.trim() || null,
        applied_at: new Date().toISOString(),
        reviewed_at: null,
      })
      .eq("user_id", userId);
    if (updateError) {
      setError("We couldn't submit your beta application. Please try again.");
    } else {
      setStatus("pending");
    }
    setSubmitting(false);
  }

  const rejected = status === "rejected";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gray-50 px-6 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-8 shadow-sm sm:p-10">
        <div className={`mb-6 flex h-12 w-12 items-center justify-center rounded-2xl ${rejected ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>
          {rejected ? <XCircle className="h-6 w-6" aria-hidden="true" /> : <Clock3 className="h-6 w-6" aria-hidden="true" />}
        </div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">TutorMonkey Teachers · Beta</p>
        <h1 className="mb-3 font-display text-3xl font-light text-gray-900">
          {rejected ? "Reapply for beta access" : status === "pending" ? "Your application is under review" : "Apply for beta access"}
        </h1>
        <p className="mb-6 text-base font-light leading-7 text-gray-600">
          {status === "pending" && !rejected
            ? `We’ll review ${email ?? "your application"} before opening the Teachers dashboard.`
            : "TutorMonkey Teachers is currently in a private beta. Tell us a little about how you teach and we’ll review your application."}
        </p>

        {status === "pending" && !rejected ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-light leading-6 text-amber-900">
            You can return here anytime. We’ll update your access after an administrator reviews your application.
          </div>
        ) : (
          <form onSubmit={submitApplication} className="space-y-4">
            <label className="block text-sm font-medium text-gray-700" htmlFor="beta-application-message">
              What do you teach, and what would you like to use TutorMonkey for?
            </label>
            <textarea
              id="beta-application-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm font-light text-gray-900 outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
              placeholder="A short note is enough."
            />
            {error && <p role="alert" className="text-sm font-light text-red-600">{error}</p>}
            <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50">
              <Send className="h-4 w-4" aria-hidden="true" />
              {submitting ? "Submitting…" : "Submit application"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
