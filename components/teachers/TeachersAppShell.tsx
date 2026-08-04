"use client";

import { useState } from "react";
import {
  Files,
  LogOut,
  Menu,
  Sparkles,
  X,
} from "lucide-react";
import type { TeachersSchemaStatus } from "@/hooks/useTeachersSchemaStatus";
import { WorkspaceSwitcher } from "@/components/teachers/WorkspaceSwitcher";
import {
  WORKSPACE_TABS,
  type WorkspaceSummary,
  type WorkspaceTabId,
} from "@/lib/teachers/fileBrowser";

type TeachersAppShellProps = {
  email: string | null;
  schemaStatus: TeachersSchemaStatus;
  signOutError?: string | null;
  onSignOut: () => void;
  /** The teacher's own course workspaces, loaded by useCourseWorkspaces. */
  workspaces: WorkspaceSummary[];
  workspacesLoading: boolean;
  currentWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onAddWorkspace: () => void;
  /** Active Documents / Materials tab — the shell mirrors it in the sidebar. */
  activeTab: WorkspaceTabId;
  onTabChange: (tab: WorkspaceTabId) => void;
  /** Documents explorer rendered in the VS Code-like left pane. */
  leftPane?: React.ReactNode;
  children: React.ReactNode;
};

const TAB_ICONS: Record<WorkspaceTabId, typeof Files> = {
  documents: Files,
  materials: Sparkles,
};


/**
 * Full-screen chrome for the Teachers application — the immersive dashboard
 * shell. Deliberately renders NO main-site Navigation/Footer: the whole
 * viewport (100dvh) belongs to the app. Desktop gets a sidebar + topbar;
 * mobile collapses the sidebar into a slide-over drawer opened from the
 * topbar. Auth/session handling stays in the page; the shell only receives
 * the signed-in surface (email, sign-out, schema status) plus the workspace
 * selector state (Google Classroom-style, at the top of the sidebar) and
 * the Documents / Materials tab state, which the sidebar mirrors on both
 * desktop and mobile.
 */
export function TeachersAppShell({
  email,
  schemaStatus,
  signOutError,
  onSignOut,
  workspaces,
  workspacesLoading,
  currentWorkspaceId,
  onSelectWorkspace,
  onAddWorkspace,
  activeTab,
  onTabChange,
  leftPane,
  children,
}: TeachersAppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const renderWorkspaceSwitcher = (closeOnClick: boolean, dark = false) => (
    <div className={`border-b pb-4 ${dark ? "border-[#3b3d49]" : "border-gray-100"}`}>
      <WorkspaceSwitcher
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        loading={workspacesLoading}
        schemaStatus={schemaStatus}
        onSelect={(workspaceId) => {
          onSelectWorkspace(workspaceId);
          if (closeOnClick) setDrawerOpen(false);
        }}
        onAddWorkspace={() => {
          onAddWorkspace();
          if (closeOnClick) setDrawerOpen(false);
        }}
        dark={dark}
      />
    </div>
  );

  const renderTabNav = (closeOnClick: boolean) => (
    <nav className="flex flex-col gap-1 px-3 py-4" aria-label="Library navigation">
      <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Library
      </p>
      {WORKSPACE_TABS.map((tab) => {
        const Icon = TAB_ICONS[tab.id];
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              onTabChange(tab.id);
              if (closeOnClick) setDrawerOpen(false);
            }}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      {/* Topbar */}
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            className="shrink-0 rounded-xl border border-gray-200 bg-white p-2.5 text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900 lg:hidden"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="hidden lg:block text-sm font-medium text-gray-500">Dashboard</span>
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-3">

          {email && (
            <span
              className="hidden max-w-[220px] truncate text-sm font-light text-gray-600 md:block"
              title={email}
            >
              {email}
            </span>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-300 hover:bg-gray-50 hover:shadow-md"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {signOutError && (
        <p
          role="alert"
          className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm font-light text-red-600 sm:px-6"
        >
          {signOutError}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-[22rem] shrink-0 flex-col border-r border-[#454652] bg-[#20212b] lg:flex">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <>
              {renderWorkspaceSwitcher(false, true)}
              {leftPane ?? renderTabNav(false)}
            </>
          </div>
        </aside>

        {/* Mobile slide-over drawer */}
        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden" role="presentation">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Workspace navigation"
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <span className="text-sm font-semibold text-gray-900">
                  TutorMonkey Teachers
                </span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close navigation"
                  className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="px-3 pt-4">{renderWorkspaceSwitcher(true, true)}</div>
                {leftPane ?? renderTabNav(true)}
              </div>
            </aside>
          </div>
        )}

        {/* Content */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
