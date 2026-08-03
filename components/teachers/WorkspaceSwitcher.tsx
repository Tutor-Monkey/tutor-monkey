"use client";

import {
  Check,
  ChevronsUpDown,
  FolderPlus,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TeachersSchemaStatus } from "@/hooks/useTeachersSchemaStatus";
import {
  describeWorkspaceSelector,
  workspaceInitials,
  type WorkspaceSummary,
} from "@/lib/teachers/fileBrowser";

type WorkspaceSwitcherProps = {
  workspaces: WorkspaceSummary[];
  currentWorkspaceId: string | null;
  loading: boolean;
  schemaStatus: TeachersSchemaStatus;
  onSelect: (workspaceId: string) => void;
  onAddWorkspace: () => void;
};

/**
 * Google Classroom-style workspace selector at the top of the sidebar.
 *
 * Shows the current workspace (initials avatar + title) and opens a menu of
 * the teacher's own course_workspaces plus an "Add workspace" action. Every
 * state is honest: loading, migration-pending (selector disabled), empty
 * (add-first), or ready with a fallback to the most recent workspace when a
 * stale selection no longer exists. Switching only updates local state —
 * the data itself is loaded by useCourseWorkspaces through RLS.
 */
export function WorkspaceSwitcher({
  workspaces,
  currentWorkspaceId,
  loading,
  schemaStatus,
  onSelect,
  onAddWorkspace,
}: WorkspaceSwitcherProps) {
  const isReady = schemaStatus === "ready";
  const state = describeWorkspaceSelector(
    workspaces,
    currentWorkspaceId,
    loading,
    isReady,
  );

  const triggerDisabled = !isReady || loading || state.phase !== "ready";

  return (
    <div className="px-3 pt-4">
      <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Workspace
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={triggerDisabled}
          title={state.phase === "ready" ? "Switch workspace" : undefined}
          className="flex w-full items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:bg-gray-50"
        >
          {state.phase === "ready" ? (
            <>
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-[11px] font-semibold text-white"
              >
                {workspaceInitials(state.current.title)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-900">
                  {state.current.title}
                </span>
                {state.current.description && (
                  <span className="block truncate text-[11px] font-light text-gray-500">
                    {state.current.description}
                  </span>
                )}
              </span>
              <ChevronsUpDown
                className="h-4 w-4 shrink-0 text-gray-400"
                aria-hidden="true"
              />
            </>
          ) : (
            <>
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FolderPlus className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-500">
                  {state.label}
                </span>
              </span>
            </>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          side="bottom"
          className="w-64"
          sideOffset={6}
        >
          {state.phase === "ready" && (
            <>
              <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Your workspaces
              </DropdownMenuLabel>
              {workspaces.map((workspace) => {
                const selected = workspace.id === state.current.id;
                return (
                  <DropdownMenuItem
                    key={workspace.id}
                    onSelect={() => onSelect(workspace.id)}
                    className="flex items-start gap-2.5 py-2"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-[10px] font-semibold text-gray-700"
                    >
                      {workspaceInitials(workspace.title)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {workspace.title}
                      </span>
                      {workspace.description && (
                        <span className="block truncate text-xs font-light text-gray-500">
                          {workspace.description}
                        </span>
                      )}
                    </span>
                    {selected && (
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-gray-900"
                        aria-hidden="true"
                      />
                    )}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
            </>
          )}

          {state.phase === "empty" && (
            <DropdownMenuLabel className="px-3 py-2 text-sm font-normal text-gray-500">
              {state.caption}
            </DropdownMenuLabel>
          )}

          <DropdownMenuItem
            onSelect={onAddWorkspace}
            disabled={!isReady}
            className="flex items-center gap-2 py-2"
          >
            <FolderPlus className="h-4 w-4 text-gray-500" aria-hidden="true" />
            <span className="text-sm font-medium text-gray-900">
              Add workspace
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {!isReady && (
        <p className="mt-2 px-1 text-[11px] font-light text-gray-400">
          Workspace selection unlocks after the Teachers database migration is
          applied.
        </p>
      )}
    </div>
  );
}
