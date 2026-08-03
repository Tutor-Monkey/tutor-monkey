"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FolderPlus,
  Loader2,
  X,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TeachersSchemaStatus } from "@/hooks/useTeachersSchemaStatus";
import type { WorkspaceSummary } from "@/lib/teachers/fileBrowser";

type AddWorkspaceDialogProps = {
  open: boolean;
  schemaStatus: TeachersSchemaStatus;
  userId: string;
  onClose: () => void;
  /** Called with the persisted row after a successful insert. */
  onCreated: (workspace: WorkspaceSummary) => void;
};

/**
 * "Add workspace" dialog opened from the sidebar workspace selector.
 *
 * Same persistence contract as the old CreateWorkspacePanel: real insert
 * through the browser Supabase client (public anon key; RLS scopes the row
 * to auth.uid()). When the schema migration isn't applied the form is
 * disabled with the honest migration-pending notice — nothing here fakes a
 * save. On success the parent refreshes the workspace list and selects the
 * new workspace.
 */
export function AddWorkspaceDialog({
  open,
  schemaStatus,
  userId,
  onClose,
  onCreated,
}: AddWorkspaceDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isReady = schemaStatus === "ready";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Reset the form each time the dialog opens so a cancelled draft never
  // leaks into the next open.
  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const { data, error } = await supabase
        .from("course_workspaces")
        .insert({
          owner_id: userId,
          title: trimmedTitle,
          description: description.trim() ? description.trim() : null,
        })
        .select("id, title, description, created_at")
        .single();

      if (error || !data) {
        console.error(
          "TutorMonkey Teachers: workspace creation failed",
          error?.message,
        );
        setSubmitError(
          "We couldn't create the workspace. Please try again in a moment.",
        );
        return;
      }

      onCreated(data as WorkspaceSummary);
    } catch {
      setSubmitError(
        "We couldn't create the workspace. Please try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-workspace-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-gray-200 bg-white shadow-2xl animate-fade-in-up"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-900">
              <FolderPlus className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="add-workspace-title"
                className="text-lg font-semibold text-gray-900"
              >
                Add a workspace
              </h2>
              <p className="mt-0.5 text-sm text-gray-500 font-light">
                One workspace per course — your documents and materials live
                here.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close add workspace dialog"
            className="shrink-0 rounded-xl border border-gray-200 bg-white p-2.5 text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 py-5">
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
                is written but hasn&apos;t been applied to your Supabase
                project. Workspace creation is disabled until then; nothing
                you type here would be saved.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="add-workspace-title-input"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Workspace title
              </label>
              <input
                id="add-workspace-title-input"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={!isReady || submitting}
                autoFocus
                placeholder="e.g. AP Biology · Period 2"
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="add-workspace-description-input"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Description <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                id="add-workspace-description-input"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!isReady || submitting}
                placeholder="e.g. Unit 1–4 materials, quizzes, and handouts"
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 shadow-sm focus:border-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            {submitError && (
              <p
                role="alert"
                className="flex items-center gap-1.5 text-sm text-red-600 font-light"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {submitError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-300 hover:bg-gray-50 hover:shadow-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isReady || submitting || !title.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:bg-gray-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                )}
                {submitting ? "Creating…" : "Create workspace"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
