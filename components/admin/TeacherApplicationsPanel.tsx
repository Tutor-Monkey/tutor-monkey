"use client";

import { useEffect, useState } from "react";

type Application = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  approval_status: "pending" | "approved" | "rejected";
  application_message: string | null;
  applied_at: string | null;
};

export function TeacherApplicationsPanel() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/teacher-applications", { cache: "no-store" });
      const data = (await response.json()) as { applications?: Application[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to load applications.");
      setApplications(data.applications ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load applications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function updateStatus(userId: string, status: Application["approval_status"]) {
    const response = await fetch("/api/admin/teacher-applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, status }),
    });
    if (!response.ok) {
      setError("That application could not be updated.");
      return;
    }
    await load();
  }

  return (
    <section className="mb-12 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Teachers beta</p>
          <h2 className="text-2xl font-light text-gray-900">Access applications</h2>
          <p className="mt-1 text-sm font-light text-gray-500">Approve teachers before they can open the workspace dashboard.</p>
        </div>
        <button type="button" onClick={() => void load()} className="text-sm font-medium text-gray-600 hover:text-gray-900">Refresh</button>
      </div>
      {loading ? <p className="text-sm font-light text-gray-500">Loading applications…</p> : error ? <p role="alert" className="text-sm text-red-600">{error}</p> : applications.length === 0 ? <p className="text-sm font-light text-gray-500">No teacher applications yet.</p> : (
        <div className="space-y-3">
          {applications.map((application) => (
            <article key={application.user_id} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{application.email ?? application.display_name ?? application.user_id}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-gray-400">{application.approval_status}</p>
                  {application.application_message && <p className="mt-3 whitespace-pre-wrap text-sm font-light leading-6 text-gray-600">{application.application_message}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => void updateStatus(application.user_id, "approved")} className="rounded-full bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800">Approve</button>
                  <button type="button" onClick={() => void updateStatus(application.user_id, "rejected")} className="rounded-full border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-white">Reject</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
