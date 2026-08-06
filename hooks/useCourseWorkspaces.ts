"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TeachersSchemaStatus } from "@/hooks/useTeachersSchemaStatus";
import type { WorkspaceSummary } from "@/lib/teachers/fileBrowser";

/**
 * Loads the signed-in teacher's course_workspaces and tracks the current
 * selection for the whole app shell.
 *
 * Real persistence only, mirroring the existing panels: the browser Supabase
 * client (public anon key) reads through RLS, so a teacher only ever sees
 * workspaces they own or belong to. When the schema migration isn't applied
 * the list stays empty and the UI shows the honest migration-pending state —
 * nothing here fakes a list.
 *
 * Selection rules:
 *   - switching is explicit (selectWorkspace);
 *   - after a load/refresh, a selection that no longer exists (deleted
 *     workspace) falls back to the most recent workspace;
 *   - with no workspaces at all the selection stays null and views render
 *     their empty states.
 */
export function useCourseWorkspaces(schemaStatus: TeachersSchemaStatus) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    null,
  );

  const isReady = schemaStatus === "ready";

  const loadWorkspaces = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("course_workspaces")
        .select("id, title, description, created_at")
        .order("created_at", { ascending: false })
        .limit(25);

      if (!error && data) {
        const rows = data as WorkspaceSummary[];
        setWorkspaces(rows);
        // Keep an explicit selection while it exists; otherwise fall back to
        // the most recent workspace (or none when the list is empty).
        setCurrentWorkspaceId((current) =>
          current && rows.some((row) => row.id === current)
            ? current
            : (rows[0]?.id ?? null),
        );
      }
    } catch {
      // Stay graceful: leave the list as-is if the query fails.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isReady) {
      void loadWorkspaces();
    }
  }, [isReady, loadWorkspaces]);

  const currentWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? null,
    [workspaces, currentWorkspaceId],
  );

  return {
    workspaces,
    loading,
    currentWorkspaceId,
    currentWorkspace,
    selectWorkspace: setCurrentWorkspaceId,
    refresh: loadWorkspaces,
  };
}
