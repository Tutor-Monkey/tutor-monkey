'use client';

import { FormEvent, useEffect, useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import { ResourceFolder } from "@/types/resources";

interface LinkInput {
  label: string;
  url: string;
}

export default function AdminResourcesPage() {
  const [resources, setResources] = useState<ResourceFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [token, setToken] = useState("");
  const [folderMode, setFolderMode] = useState<"existing" | "new">("existing");
  const [selectedFolder, setSelectedFolder] = useState("");
  const [newFolderTitle, setNewFolderTitle] = useState("");
  const [defaultOpen, setDefaultOpen] = useState(false);
  const [resourceTitle, setResourceTitle] = useState("");
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState<LinkInput[]>([{ label: "", url: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [editingFolderTitle, setEditingFolderTitle] = useState<string | null>(null);

  const isEditing = Boolean(editingResourceId);

  const folderOptions = useMemo(() => resources.map((folder) => folder.title), [resources]);

  useEffect(() => {
    void loadResources();
  }, []);

  async function loadResources() {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/admin/resources");
      if (!response.ok) throw new Error("Failed to load resources");
      const data = (await response.json()) as { resources: ResourceFolder[] };
      setResources(data.resources);
      setSelectedFolder((previous) => {
        if (data.resources.length === 0) return "";
        const current = data.resources.find((folder) => folder.title === previous);
        return current ? current.title : data.resources[0].title;
      });
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleLinkChange(index: number, field: keyof LinkInput, value: string) {
    setLinks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addLinkField() {
    setLinks((prev) => [...prev, { label: "", url: "" }]);
  }

  function removeLinkField(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  }

  function startEditing(folder: ResourceFolder, resource: ResourceFolder["resources"][number]) {
    if (!resource.id) {
      setFormError("Unable to edit this resource because it is missing an identifier.");
      return;
    }

    setFolderMode("existing");
    setSelectedFolder(folder.title);
    setEditingFolderTitle(folder.title);
    setNewFolderTitle("");
    setDefaultOpen(folder.defaultOpen ?? false);
    setResourceTitle(resource.title);
    setDescription(resource.description);
    const mappedLinks = resource.links.map((link) => ({ label: link.label, url: link.url }));
    setLinks(mappedLinks.length > 0 ? mappedLinks : [{ label: "", url: "" }]);
    setEditingResourceId(resource.id);
    setFormError(null);
    setSuccess(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditing() {
    resetForm({ clearEditing: true });
    setFolderMode("existing");
    setNewFolderTitle("");
    setDefaultOpen(false);
    setFormError(null);
    setSuccess(null);
  }

  async function handleDelete(resourceId: string, resourceTitle: string) {
    setFormError(null);
    setSuccess(null);

    if (!token.trim()) {
      setFormError("Admin token is required to delete.");
      return;
    }

    const confirmed = window.confirm(`Delete “${resourceTitle}”? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch("/api/admin/resources", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.trim()}`
        },
        body: JSON.stringify({ resourceId })
      });

      if (!response.ok) {
        const { error: message } = (await response.json()) as { error?: string };
        throw new Error(message ?? "Failed to delete resource.");
      }

      const data = (await response.json()) as { resources: ResourceFolder[] };
      setResources(data.resources);

      if (editingResourceId === resourceId) {
        cancelEditing();
      }

      if (data.resources.length > 0) {
        const currentSelection = data.resources.find((folder) => folder.title === selectedFolder);
        setSelectedFolder((currentSelection ?? data.resources[0]).title);
      } else {
        setSelectedFolder("");
      }

      setSuccess("Resource deleted.");
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function sendReorder(payload: { folders?: string[]; resources?: Array<{ folderId: string; resourceIds: string[] }>; links?: Array<{ resourceId: string; linkIds: string[] }> }) {
    setFormError(null);
    setSuccess(null);

    if (!token.trim()) {
      setFormError("Admin token is required to reorder.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch("/api/admin/resources", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.trim()}`
        },
        body: JSON.stringify({ action: "reorder", ...payload })
      });

      if (!response.ok) {
        const { error: message } = (await response.json()) as { error?: string };
        throw new Error(message ?? "Failed to reorder resources.");
      }

      const data = (await response.json()) as { resources: ResourceFolder[] };
      setResources(data.resources);
      setSuccess("Order updated.");
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function moveLinkUp(index: number) {
    setLinks((prev) => {
      const next = [...prev];
      if (index <= 0) return prev;
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveLinkDown(index: number) {
    setLinks((prev) => {
      const next = [...prev];
      if (index >= next.length - 1) return prev;
      [next[index + 1], next[index]] = [next[index], next[index + 1]];
      return next;
    });
  }

  function moveFolderUp(folderId?: string) {
    if (!folderId) return;
    const index = resources.findIndex((f) => f.id === folderId);
    if (index <= 0) return;
    const next = [...resources];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    const folderIds = next.map((f) => f.id ?? "").filter(Boolean);
    void sendReorder({ folders: folderIds });
  }

  function moveFolderDown(folderId?: string) {
    if (!folderId) return;
    const index = resources.findIndex((f) => f.id === folderId);
    if (index === -1 || index >= resources.length - 1) return;
    const next = [...resources];
    [next[index + 1], next[index]] = [next[index], next[index + 1]];
    const folderIds = next.map((f) => f.id ?? "").filter(Boolean);
    void sendReorder({ folders: folderIds });
  }

  function moveResourceUp(folderId: string | undefined, resourceId: string | undefined) {
    if (!folderId || !resourceId) return;
    const folder = resources.find((f) => f.id === folderId);
    if (!folder) return;
    const idx = folder.resources.findIndex((r) => r.id === resourceId);
    if (idx <= 0) return;
    const nextResources = [...folder.resources];
    [nextResources[idx - 1], nextResources[idx]] = [nextResources[idx], nextResources[idx - 1]];
    const resourceIds = nextResources.map((r) => r.id ?? "").filter(Boolean);
    void sendReorder({ resources: [{ folderId, resourceIds }] });
  }

  function moveResourceDown(folderId: string | undefined, resourceId: string | undefined) {
    if (!folderId || !resourceId) return;
    const folder = resources.find((f) => f.id === folderId);
    if (!folder) return;
    const idx = folder.resources.findIndex((r) => r.id === resourceId);
    if (idx === -1 || idx >= folder.resources.length - 1) return;
    const nextResources = [...folder.resources];
    [nextResources[idx + 1], nextResources[idx]] = [nextResources[idx], nextResources[idx + 1]];
    const resourceIds = nextResources.map((r) => r.id ?? "").filter(Boolean);
    void sendReorder({ resources: [{ folderId, resourceIds }] });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);

    const trimmedLinks = links
      .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
      .filter((link) => link.label && link.url);

    if (trimmedLinks.length === 0) {
      setFormError("Please provide at least one link with a label and URL.");
      return;
    }

    if (!resourceTitle.trim() || !description.trim()) {
      setFormError("Title and description are required.");
      return;
    }

    const isCreatingFolder = folderMode === "new";
    const targetFolderTitle = isCreatingFolder ? newFolderTitle.trim() : selectedFolder.trim();

    if (!targetFolderTitle) {
      setFormError("Please choose a subject or provide a new subject name.");
      return;
    }

    if (isEditing && !editingResourceId) {
      setFormError("Unable to update this resource. Please try again.");
      return;
    }

    if (!token.trim()) {
      setFormError("Admin token is required to submit.");
      return;
    }

    const method = isEditing ? "PATCH" : "POST";
    const payload = isEditing
      ? {
          action: "updateResource" as const,
          resourceId: editingResourceId!,
          folderTitle: !isCreatingFolder ? targetFolderTitle : undefined,
          newFolderTitle: isCreatingFolder ? targetFolderTitle : undefined,
          createFolder: isCreatingFolder,
          defaultOpen: isCreatingFolder ? defaultOpen : undefined,
          resource: {
            title: resourceTitle.trim(),
            description: description.trim(),
            links: trimmedLinks
          }
        }
      : {
          action: "addResource" as const,
          folderTitle: !isCreatingFolder ? targetFolderTitle : undefined,
          newFolderTitle: isCreatingFolder ? targetFolderTitle : undefined,
          createFolder: isCreatingFolder,
          defaultOpen: isCreatingFolder ? defaultOpen : undefined,
          resource: {
            title: resourceTitle.trim(),
            description: description.trim(),
            links: trimmedLinks
          }
        };

    try {
      setSubmitting(true);
      const response = await fetch("/api/admin/resources", {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.trim()}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const { error: message } = (await response.json()) as { error?: string };
        throw new Error(message ?? "Failed to add resource.");
      }

      const data = (await response.json()) as { resources: ResourceFolder[] };
      setResources(data.resources);

      const nextFolderTitle =
        isCreatingFolder && payload.newFolderTitle
          ? payload.newFolderTitle
          : targetFolderTitle || data.resources[0]?.title || "";
      if (nextFolderTitle) {
        setSelectedFolder(nextFolderTitle);
      }

      setSuccess(isEditing ? "Resource updated successfully!" : "Resource added successfully!");
      resetForm({ wasNewFolder: isCreatingFolder });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm(options?: { wasNewFolder?: boolean; clearEditing?: boolean }) {
    setResourceTitle("");
    setDescription("");
    setLinks([{ label: "", url: "" }]);
    if (options?.wasNewFolder) {
      setFolderMode("existing");
      setNewFolderTitle("");
      setDefaultOpen(false);
    }
    if (options?.clearEditing ?? true) {
      setEditingResourceId(null);
      setEditingFolderTitle(null);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <Navigation />
      <section className="pt-32 pb-24 px-6">
        <div className="max-w-5xl mx-auto">
          <header className="mb-12">
            <h1 className="text-4xl font-light text-gray-900 mb-3">Resources Admin</h1>
            <p className="text-gray-600 max-w-3xl">
              Add new worksheets or subjects without editing code. Provide your admin token, choose whether the worksheet belongs
              to an existing subject or a new one, and paste the Google Drive links.
            </p>
          </header>

          <div className="grid gap-12 lg:grid-cols-[2fr,1fr]">
            <form
              onSubmit={handleSubmit}
              className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 flex flex-col gap-6"
            >
              <div className="grid gap-1">
                <label htmlFor="admin-token" className="text-sm font-semibold text-gray-700">
                  Admin Token
                </label>
                <input
                  id="admin-token"
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="Paste the ADMIN_API_TOKEN value"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {isEditing && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Editing “{resourceTitle || "Untitled"}” in{" "}
                  {folderMode === "new"
                    ? newFolderTitle || "New subject"
                    : selectedFolder || editingFolderTitle}. Update the details below, then choose{" "}
                  <span className="font-semibold">Update resource</span> or{" "}
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="underline hover:text-blue-600"
                  >
                    cancel editing
                  </button>
                  .
                </div>
              )}

              <fieldset className="grid gap-2">
                <legend className="text-sm font-semibold text-gray-700">Subject</legend>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="folder-mode"
                      value="existing"
                      checked={folderMode === "existing"}
                      onChange={() => setFolderMode("existing")}
                    />
                    Existing subject
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="folder-mode"
                      value="new"
                      checked={folderMode === "new"}
                      onChange={() => setFolderMode("new")}
                    />
                    New subject
                  </label>
                </div>

                {folderMode === "existing" ? (
                  <select
                    value={selectedFolder}
                    onChange={(event) => setSelectedFolder(event.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={folderOptions.length === 0}
                  >
                    {folderOptions.length === 0 ? (
                      <option value="" disabled>
                        No subjects available
                      </option>
                    ) : (
                      folderOptions.map((title) => (
                        <option key={title} value={title}>
                          {title}
                        </option>
                      ))
                    )}
                  </select>
                ) : (
                  <div className="grid gap-2">
                    <input
                      type="text"
                      value={newFolderTitle}
                      onChange={(event) => setNewFolderTitle(event.target.value)}
                      placeholder="New subject name"
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <label className="text-sm text-gray-600 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={defaultOpen}
                        onChange={(event) => setDefaultOpen(event.target.checked)}
                      />
                      Open by default on the resources page
                    </label>
                  </div>
                )}
              </fieldset>

              <div className="grid gap-1">
                <label htmlFor="resource-title" className="text-sm font-semibold text-gray-700">
                  Worksheet Title
                </label>
                <input
                  id="resource-title"
                  type="text"
                  value={resourceTitle}
                  onChange={(event) => setResourceTitle(event.target.value)}
                  placeholder="e.g. Protein Synthesis Worksheet"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="grid gap-1">
                <label htmlFor="resource-description" className="text-sm font-semibold text-gray-700">
                  Description
                </label>
                <textarea
                  id="resource-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Short summary that appears under the title."
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-y"
                  required
                />
              </div>

              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Links</span>
                  <button
                    type="button"
                    onClick={addLinkField}
                    className="text-sm text-blue-600 hover:text-blue-500"
                  >
                    + Add another link
                  </button>
                </div>

                {links.map((link, index) => (
                  <div key={index} className="grid gap-2 border border-gray-200 rounded-xl p-3">
                    <div className="flex gap-2">
                      <div className="flex-1 grid gap-1">
                        <label className="text-xs font-semibold text-gray-600">Link Label</label>
                        <input
                          type="text"
                          value={link.label}
                          onChange={(event) => handleLinkChange(index, "label", event.target.value)}
                          placeholder="e.g. View Worksheet"
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex flex-col items-start gap-1">
                        <button
                          type="button"
                          onClick={() => moveLinkUp(index)}
                          className="text-xs font-semibold text-gray-600 hover:text-gray-800"
                          disabled={index === 0}
                          aria-label="Move link up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveLinkDown(index)}
                          className="text-xs font-semibold text-gray-600 hover:text-gray-800"
                          disabled={index === links.length - 1}
                          aria-label="Move link down"
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-1">
                      <label className="text-xs font-semibold text-gray-600">Google Drive URL</label>
                      <input
                        type="url"
                        value={link.url}
                        onChange={(event) => handleLinkChange(index, "url", event.target.value)}
                        placeholder="https://drive.google.com/..."
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    {links.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLinkField(index)}
                        className="text-xs text-red-600 hover:text-red-500 justify-self-end"
                      >
                        Remove link
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}
              {success && <p className="text-sm text-green-600">{success}</p>}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-full bg-blue-600 text-white px-6 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
                >
                  {submitting
                    ? isEditing
                      ? "Updating..."
                      : "Saving..."
                    : isEditing
                      ? "Update resource"
                      : "Save resource"}
                </button>
                {isEditing && (
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="text-sm font-semibold text-gray-600 hover:text-gray-800 disabled:opacity-60"
                    disabled={submitting}
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </form>

            <aside className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 h-fit">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Current worksheets</h2>
              {loading ? (
                <p className="text-sm text-gray-500">Loading resources…</p>
              ) : loadError && resources.length === 0 ? (
                <p className="text-sm text-red-600">{loadError}</p>
              ) : resources.length === 0 ? (
                <p className="text-sm text-gray-500">No resources available yet.</p>
              ) : (
                <ul className="space-y-4 text-sm text-gray-700">
                  {resources.map((folder) => (
                    <li
                      key={folder.id ?? folder.title}
                      className="rounded-xl border border-gray-200 px-4 py-3 bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <p className="font-semibold text-gray-900">{folder.title}</p>
                          {folder.defaultOpen ? (
                            <p className="text-xs text-gray-500">Opens by default on the resources page</p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col items-end mr-2">
                            <button
                              type="button"
                              onClick={() => moveFolderUp(folder.id)}
                              className="text-xs font-semibold text-gray-600 hover:text-gray-800"
                              disabled={submitting || !folder.id}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => moveFolderDown(folder.id)}
                              className="text-xs font-semibold text-gray-600 hover:text-gray-800"
                              disabled={submitting || !folder.id}
                            >
                              ▼
                            </button>
                          </div>
                          <span className="text-xs text-gray-500">
                            {folder.resources.length} {folder.resources.length === 1 ? "item" : "items"}
                          </span>
                        </div>
                      </div>
                      {folder.resources.length === 0 ? (
                        <p className="text-xs text-gray-500">No worksheets yet.</p>
                      ) : (
                        <ul className="space-y-3">
                          {folder.resources.map((resource) => {
                            const resourceKey = resource.id ?? `${folder.title}-${resource.title}`;
                            const isEditingThis = editingResourceId === resource.id;
                            return (
                              <li
                                key={resourceKey}
                                className={`rounded-lg border px-3 py-3 ${
                                  isEditingThis ? "border-blue-300 bg-blue-50" : "border-white bg-white"
                                }`}
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">{resource.title}</p>
                                    <p className="text-xs text-gray-600 mt-1">{resource.description}</p>
                                    {resource.links?.length ? (
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {resource.links.map((l) => (
                                          <span key={l.id} className="text-xs text-gray-600 bg-gray-100 rounded px-2 py-1">
                                            {l.label}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <div className="flex flex-col mr-1">
                                      <button
                                        type="button"
                                        onClick={() => moveResourceUp(folder.id, resource.id)}
                                        className="text-xs font-semibold text-gray-600 hover:text-gray-800"
                                        disabled={submitting || !resource.id}
                                        aria-label="Move up"
                                      >
                                        ▲
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => moveResourceDown(folder.id, resource.id)}
                                        className="text-xs font-semibold text-gray-600 hover:text-gray-800"
                                        disabled={submitting || !resource.id}
                                        aria-label="Move down"
                                      >
                                        ▼
                                      </button>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => startEditing(folder, resource)}
                                      className="text-xs font-semibold text-blue-600 hover:text-blue-500 disabled:opacity-40"
                                      disabled={submitting || !resource.id}
                                    >
                                      {isEditingThis ? "Editing…" : "Edit"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => resource.id && handleDelete(resource.id, resource.title)}
                                      className="text-xs font-semibold text-red-600 hover:text-red-500 disabled:opacity-40"
                                      disabled={submitting || !resource.id}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-gray-400 mt-6">
                Tip: make sure each Google Drive link is set to “Anyone with the link can view” before adding or editing it here.
              </p>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
