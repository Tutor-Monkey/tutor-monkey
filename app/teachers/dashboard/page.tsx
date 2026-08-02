"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import {
  Upload,
  FolderTree,
  PenLine,
  FileDown,
  LogOut,
  Sparkles,
  Clock3,
  ArrowRight,
  Inbox,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useTeachersSchemaStatus } from "@/hooks/useTeachersSchemaStatus";
import { CreateWorkspacePanel } from "@/components/teachers/CreateWorkspacePanel";
import { MaterialsIntakePanel } from "@/components/teachers/MaterialsIntakePanel";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; session: Session };

const workspaceFeatures = [
  {
    icon: Upload,
    title: "Import materials",
    description:
      "Drop in PDFs, slide decks, handouts, and notes — TutorMonkey will read your materials as-is.",
  },
  {
    icon: FolderTree,
    title: "Course library",
    description:
      "File everything by course, unit, and topic so your library mirrors your syllabus.",
  },
  {
    icon: PenLine,
    title: "Generate worksheets",
    description:
      "New handouts written in your voice, with matching answer keys, ready to print.",
  },
  {
    icon: FileDown,
    title: "Export & share",
    description:
      "Download classroom-ready PDFs with answer keys included — print, post, or share.",
  },
];

export default function TeachersDashboardPage() {
  const [authState, setAuthState] = useState<AuthState>({
    status: "loading",
  });
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const schemaStatus = useTeachersSchemaStatus();

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setAuthState({ status: "signedOut" });
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setAuthState(
        data.session
          ? { status: "signedIn", session: data.session }
          : { status: "signedOut" },
      );
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setAuthState(
        session
          ? { status: "signedIn", session }
          : { status: "signedOut" },
      );
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setSignOutError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSignOutError(
        "We couldn't sign you out. Please try again in a moment.",
      );
    }
    // onAuthStateChange flips the state to signedOut on success.
  }

  const email =
    authState.status === "signedIn" ? authState.session.user.email : null;

  return (
    <main className="min-h-screen bg-white">
      <Navigation />

      <section className="pt-36 pb-24 px-6">
        <div className="max-w-5xl mx-auto">
          {authState.status === "loading" && (
            <div className="flex flex-col items-center gap-4 py-24 text-gray-500 animate-fade-in">
              <Clock3 className="h-8 w-8 animate-pulse" aria-hidden="true" />
              <p className="font-light">Loading your workspace…</p>
            </div>
          )}

          {authState.status === "signedOut" && (
            <div className="max-w-md mx-auto text-center animate-fade-in-up">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-900">
                <Inbox className="h-7 w-7" aria-hidden="true" />
              </div>
              <h1 className="text-4xl font-light text-gray-900 mb-4 font-display text-balance">
                You&apos;re signed out
              </h1>
              <p className="text-lg text-gray-600 font-light mb-8">
                Sign in with your Google account to open your Teachers
                workspace.
              </p>
              <Link
                href="/teachers/sign-in"
                className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-7 py-3.5 text-base font-medium text-white shadow-sm transition-all duration-300 hover:bg-gray-800 hover:shadow-md"
              >
                Sign in with Google
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          )}

          {authState.status === "signedIn" && (
            <>
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-12 animate-fade-in-up">
                <div>
                  <p className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-sm font-medium text-gray-600 mb-4">
                    <Sparkles className="h-4 w-4 text-gray-500" aria-hidden="true" />
                    TutorMonkey Teachers · Dashboard
                  </p>
                  <h1 className="text-4xl md:text-5xl font-light text-gray-900 mb-3 font-display text-balance">
                    Welcome back{email ? `, ${email.split("@")[0]}` : ""}
                  </h1>
                  {email && (
                    <p className="text-lg text-gray-600 font-light">
                      Signed in as{" "}
                      <span className="font-medium text-gray-900">{email}</span>
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-start md:items-end gap-3">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-300 hover:bg-gray-50 hover:shadow-md"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Sign out
                  </button>
                  {signOutError && (
                    <p role="alert" className="text-sm text-red-600 font-light">
                      {signOutError}
                    </p>
                  )}
                </div>
              </div>

              {/* Workspace creation + materials intake */}
              <div className="grid lg:grid-cols-2 gap-8 mb-16 animate-fade-in-up animation-delay-200">
                <CreateWorkspacePanel
                  schemaStatus={schemaStatus}
                  userId={authState.session.user.id}
                />
                <MaterialsIntakePanel
                  schemaStatus={schemaStatus}
                  userId={authState.session.user.id}
                />
              </div>

              {/* Roadmap: next product surfaces */}
              <div className="animate-fade-in-up animation-delay-400">
                <h2 className="text-2xl md:text-3xl font-light text-gray-900 mb-2 font-display text-balance">
                  What&apos;s next
                </h2>
                <p className="text-gray-600 font-light max-w-xl mb-8">
                  The pieces that turn your workspace into a worksheet machine.
                </p>

                <div className="grid sm:grid-cols-2 gap-6">
                  {workspaceFeatures.map((feature) => (
                    <div
                      key={feature.title}
                      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover-lift"
                    >
                      <div className="flex items-center justify-between mb-5">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-900">
                          <feature.icon className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          On the roadmap
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {feature.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-gray-600 font-light">
                        {feature.description}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="mt-8 text-sm text-gray-500 font-light">
                  {schemaStatus === "ready"
                    ? "Workspaces and uploads you save go to Supabase under your account — uploads land in the workspace you explicitly pick. Document reading and worksheet generation land in the next milestone."
                    : "The Teachers database migration (supabase/migrations/) is written but not applied yet — this page degrades gracefully until it is."}
                </p>
              </div>

              {/* Back link */}
              <div className="mt-10 text-center">
                <Link
                  href="/teachers"
                  className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium"
                >
                  <ArrowRight className="h-4 w-4 rotate-180" aria-hidden="true" />
                  Back to the Teachers overview
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
