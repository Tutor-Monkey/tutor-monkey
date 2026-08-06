"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, FolderPlus, Inbox } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useTeachersSchemaStatus } from "@/hooks/useTeachersSchemaStatus";
import { useCourseWorkspaces } from "@/hooks/useCourseWorkspaces";
import type { WorkspaceTabId } from "@/lib/teachers/fileBrowser";
import { TeachersAppShell } from "@/components/teachers/TeachersAppShell";
import { AddWorkspaceDialog } from "@/components/teachers/AddWorkspaceDialog";
import { DocumentsView } from "@/components/teachers/DocumentsView";
import { MaterialsView } from "@/components/teachers/MaterialsView";
import { BetaApplicationGate } from "@/components/teachers/BetaApplicationGate";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; session: Session };

/**
 * Teachers dashboard — an immersive, full-screen application shell.
 *
 * Unlike the public /teachers launcher (which keeps the main-site
 * Navigation/Footer), this page renders NO main-site chrome: the whole
 * viewport (100dvh) is the app. The signed-in surface lives inside
 * TeachersAppShell (topbar + sidebar + mobile drawer); the loading and
 * signed-out states are full-screen too.
 *
 * Workspace state is owned here (useCourseWorkspaces) and shared with the
 * shell: the sidebar workspace selector, the Documents / Materials tabs and
 * the two file-browser views all switch in place — no page reloads.
 * Workspace creation happens through AddWorkspaceDialog (replacing the old
 * CreateWorkspacePanel); the new workspace is selected immediately.
 */
export default function TeachersDashboardPage() {
  const [authState, setAuthState] = useState<AuthState>({
    status: "loading",
  });
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [betaApproved, setBetaApproved] = useState<boolean | null>(null);
  const schemaStatus = useTeachersSchemaStatus();

  const {
    workspaces,
    loading: workspacesLoading,
    currentWorkspaceId,
    currentWorkspace,
    selectWorkspace,
    refresh: refreshWorkspaces,
  } = useCourseWorkspaces(schemaStatus);

  const [activeTab, setActiveTab] = useState<WorkspaceTabId>("documents");
  const [addWorkspaceOpen, setAddWorkspaceOpen] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setAuthState({ status: "signedOut" });
      setBetaApproved(false);
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
      setBetaApproved(data.session ? null : false);
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
      setBetaApproved(session ? null : false);
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
  const workspaceSetupVisible =
    authState.status === "signedIn" &&
    !workspacesLoading &&
    workspaces.length === 0;

  return (
    <>
      {authState.status === "loading" && (
        <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-gray-500">
          <Clock3 className="h-8 w-8 animate-pulse" aria-hidden="true" />
          <p className="font-light">Loading your workspace…</p>
        </div>
      )}

      {authState.status === "signedOut" && (
        <div className="flex h-dvh items-center justify-center bg-gray-50 px-6">
          <div className="w-full max-w-md text-center animate-fade-in-up">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-900">
              <Inbox className="h-7 w-7" aria-hidden="true" />
            </div>
            <h1 className="mb-4 font-display text-4xl font-light text-balance text-gray-900">
              You&apos;re signed out
            </h1>
            <p className="mb-8 text-lg font-light text-gray-600">
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
        </div>
      )}

      {authState.status === "signedIn" && betaApproved !== true && (
        <BetaApplicationGate
          userId={authState.session.user.id}
          email={authState.session.user.email ?? null}
          onApproved={() => setBetaApproved(true)}
        />
      )}

      {authState.status === "signedIn" && betaApproved === true && workspaceSetupVisible && (
        <main className="flex h-dvh items-center justify-center bg-gray-50 px-6">
          <section className="w-full max-w-lg text-center animate-fade-in-up">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 text-white shadow-sm">
              <FolderPlus className="h-7 w-7" aria-hidden="true" />
            </div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
              TutorMonkey Teachers
            </p>
            <h1 className="mb-4 font-display text-4xl font-light text-balance text-gray-900 md:text-5xl">
              Create your first workspace
            </h1>
            <p className="mx-auto mb-8 max-w-md text-base font-light leading-7 text-gray-600">
              Start with a course workspace. Your Documents and generated
              Materials will live inside it.
            </p>
            {schemaStatus === "not-applied" && (
              <p className="mx-auto mb-6 max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-light text-amber-800">
                Workspace setup is temporarily unavailable because the Teachers
                database migration has not been applied yet.
              </p>
            )}
            <button
              type="button"
              onClick={() => setAddWorkspaceOpen(true)}
              disabled={schemaStatus !== "ready"}
              className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-7 py-3.5 text-base font-medium text-white shadow-sm transition-all duration-300 hover:bg-gray-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              Add new workspace
            </button>
          </section>
        </main>
      )}

      {authState.status === "signedIn" && betaApproved === true && !workspaceSetupVisible && (
        <TeachersAppShell
          email={email ?? null}
          schemaStatus={schemaStatus}
          signOutError={signOutError}
          onSignOut={() => void handleSignOut()}
          workspaces={workspaces}
          workspacesLoading={workspacesLoading}
          currentWorkspaceId={currentWorkspaceId}
          onSelectWorkspace={selectWorkspace}
          onAddWorkspace={() => setAddWorkspaceOpen(true)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          leftPane={
            <DocumentsView
              schemaStatus={schemaStatus}
              userId={authState.session.user.id}
              currentWorkspace={currentWorkspace}
            />
          }
        >
          <MaterialsView
            schemaStatus={schemaStatus}
            currentWorkspace={currentWorkspace}
            onSwitchToDocuments={() => undefined}
          />
        </TeachersAppShell>
      )}

      {/* Workspace creation — replaces the old CreateWorkspacePanel surface. */}
      {authState.status === "signedIn" && betaApproved === true && (
        <AddWorkspaceDialog
          open={addWorkspaceOpen}
          schemaStatus={schemaStatus}
          userId={authState.session.user.id}
          onClose={() => setAddWorkspaceOpen(false)}
          onCreated={(workspace) => {
            setAddWorkspaceOpen(false);
            void refreshWorkspaces();
            selectWorkspace(workspace.id);
          }}
        />
      )}
    </>
  );
}
