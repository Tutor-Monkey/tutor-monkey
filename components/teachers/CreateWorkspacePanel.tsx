"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FolderPlus,
  Loader2,
  Plus,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TeachersSchemaStatus } from "@/hooks/useTeachersSchemaStatus";

type WorkspaceRow = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
};

type CreateWorkspacePanelProps = {
  schemaStatus: TeachersSchemaStatus;
  userId: string;
};

/**
 * Create-workspace form + the signed-in teacher's workspace list.
 *
 * Real persistence only: when the migration (supabase/migrations/) has been
 * applied, submitting inserts a course_workspaces row through the browser
 * Supabase client (public anon key; RLS scopes it to auth.uid()). When the
 * tables aren't applied yet the form is disabled with an honest notice —
 * nothing here fakes a save.
 */
export function CreateWorkspacePanel({
  schemaStatus,
  userId,
}: CreateWorkspacePanelProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);

  const isReady = schemaStatus === "ready";

  const loadWorkspaces = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setLoadingWorkspaces(true);
    try {
      const { data, error } = await supabase
        .from("course_workspaces")
        .select("id, title, description, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

      if (!error && data) {
        setWorkspaces(data as WorkspaceRow[]);
      }
    } catch {
      // Stay graceful: leave the list as-is if the query fails.
    } finally {
      setLoadingWorkspaces(false);
    }
  }, []);

  useEffect(() => {
    if (isReady) {
      void loadWorkspaces();
    }
  }, [isReady, loadWorkspaces]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setSubmitting(true);
    setSubmitError(null);
    setJustCreated(false);

    try {
      const { error } = await supabase.from("course_workspaces").insert({
        owner_id: userId,
        title: trimmedTitle,
        description: description.trim() ? description.trim() : null,
      });

      if (error) {
        console.error(
          "TutorMonkey Teachers: workspace creation failed",
          error.message,
        );
        setSubmitError(
          "We couldn't create the workspace. Please try again in a moment.",
        );
        return;
      }

      setTitle("");
      setDescription("");
      setJustCreated(true);
      await loadWorkspaces();
    } catch {
      setSubmitError(
        "We couldn't create the workspace. Please try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-900">
            <FolderPlus className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Create a workspace
            </h2>
            <p className="text-sm text-gray-500 font-light">
              One workspace per course — your library lives here.
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            isReady ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500"
          }`}
        >
          {isReady
            ? "Ready"
            : schemaStatus === "checking"
              ? "Checking"
              : "Migration pending"}
        </span>
      </div>

      {schemaStatus === "checking" && (
        <p className="text-sm text-gray-500 font-light animate-pulse">
          Checking the Teachers database…
        </p>
      )}

      {schemaStatus === "not-applied" && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 animate-fade-in">
          <Database className="h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="font-light">
            The Teachers database isn&apos;t live yet — the schema in{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">
              supabase/migrations/
            </code>{" "}
            is written but hasn&apos;t been applied to your Supabase project.
            Workspace creation is disabled until then; nothing you type here
            would be saved.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="workspace-title"
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            Workspace title
          </label>
          <input
            id="workspace-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={!isReady}
            placeholder="e.g. AP Biology · Period 2"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <div>
          <label
            htmlFor="workspace-description"
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            Description <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            id="workspace-description"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={!isReady}
            placeholder="e.g. Unit 1–4 materials, quizzes, and handouts"
            className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={!isReady || submitting || !title.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:bg-gray-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {submitting ? "Creating…" : "Create workspace"}
          </button>

          {submitError && (
            <p
              role="alert"
              className="flex items-center gap-1.5 text-sm text-red-600 font-light"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {submitError}
            </p>
          )}
          {justCreated && !submitError && (
            <p className="flex items-center gap-1.5 text-sm text-green-700 font-light">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              Workspace created — it now appears below.
            </p>
          )}
        </div>
      </form>

      {isReady && (
        <div className="mt-8 border-t border-gray-100 pt-6">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Your workspaces
          </h3>
          {loadingWorkspaces ? (
            <p className="text-sm text-gray-500 font-light">
              Loading your workspaces…
            </p>
          ) : workspaces.length === 0 ? (
            <p className="text-sm text-gray-500 font-light">
              No workspaces yet — create your first one above.
            </p>
          ) : (
            <ul className="space-y-2">
              {workspaces.map((workspace) => (
                <li
                  key={workspace.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {workspace.title}
                    </p>
                    {workspace.description && (
                      <p className="mt-0.5 truncate text-xs text-gray-500 font-light">
                        {workspace.description}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-gray-500">
                    {new Date(workspace.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
