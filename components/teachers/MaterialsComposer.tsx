"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  FileText,
  Loader2,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  buildConfirmationSources,
  canConfirmGeneration,
  findMentionAtCaret,
  includedReadySourceIds,
  isReadySourceDoc,
  replaceMentionRange,
  setSuggestedSourcesIncluded,
  toggleConfirmationSource,
  type ComposerSourceDoc,
  type ConfirmationSource,
  type MentionState,
  SUGGESTION_LIMIT_MAX,
} from "@/lib/teachers/materialsComposer";
import { MAX_TEACHER_PROMPT_CHARS } from "@/lib/teachers/generateRequest";
import { shortDate } from "@/lib/teachers/materialDetail";
import { MaterialStatusBadge } from "@/components/teachers/MaterialStatusBadge";
import {
  fetchWorkspaceSuggestions,
  requestWorkspaceGeneration,
  type GeneratedComposerMaterial,
} from "@/lib/teachers/workspaceComposerClient";
import {
  loadGooglePicker,
  openGoogleDrivePicker,
  readGoogleProviderToken,
} from "@/lib/teachers/googlePickerClient";
import { readGooglePickerPublicConfig } from "@/lib/teachers/googlePicker";
import { uploadWorksheetToDrive } from "@/lib/teachers/driveSaveClient";

const MENTION_LISTBOX_ID = "materials-composer-mention-listbox";

function optionId(index: number): string {
  return `materials-composer-mention-option-${index}`;
}

/**
 * Remove every `@filename` mention of a removed chip from the prompt text so
 * the chips and the prompt stay consistent (chips are the explicit source
 * selection; the mention text alone is not). Component-local: the pure
 * mention machinery in materialsComposer.ts intentionally owns range math
 * only, not string cleanup of this shape.
 */
function stripMentionText(text: string, filename: string): string {
  const mention = `@${filename}`;
  let next = text;
  let at = next.indexOf(mention);
  while (at >= 0) {
    const rest = next.slice(at + mention.length);
    const restWithoutSpace = rest.startsWith(" ") ? rest.slice(1) : rest;
    next = next.slice(0, at) + restWithoutSpace;
    at = next.indexOf(mention);
  }
  return next;
}

type MaterialsComposerProps = {
  /** The workspace all suggestions/generation are scoped to. */
  currentWorkspaceId: string;
  /**
   * Called once a generation is saved server-side; the parent refreshes its
   * (legacy) list. The composer itself keeps showing the generated material.
   */
  onGenerated: (material: GeneratedComposerMaterial) => void;
};

/**
 * Materials composer — the ChatGPT-like "create with AI" surface at the top
 * of the Materials view.
 *
 * Flow: the teacher types a prompt and `@`-mentions source documents (or
 * lets the composer auto-suggest related documents from the prompt). Sending
 * NEVER generates: it opens a confirmation panel listing explicit + suggested
 * sources with include/exclude controls. Generation happens only on
 * "Confirm sources & generate", which POSTs the workspace generate route.
 *
 * Metadata only: the only document data that ever reaches this component is
 * ComposerSourceDoc (id, filename, status, folder segments). Extracted text
 * stays on the server; the generate route resolves it internally.
 */
export function MaterialsComposer({
  currentWorkspaceId,
  onGenerated,
}: MaterialsComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [explicitDocs, setExplicitDocs] = useState<ComposerSourceDoc[]>([]);

  // Mention menu state.
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuDocs, setMenuDocs] = useState<ComposerSourceDoc[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Composer submit state.
  const [submitting, setSubmitting] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // Confirmation panel + generation state.
  const [confirmation, setConfirmation] = useState<ConfirmationSource[] | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [generated, setGenerated] = useState<GeneratedComposerMaterial | null>(
    null,
  );
  const [driveSaving, setDriveSaving] = useState(false);
  const [driveSaved, setDriveSaved] = useState<{
    name: string;
    webViewLink: string | null;
  } | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);

  const mention: MentionState = useMemo(
    () => findMentionAtCaret(text, caret),
    [text, caret],
  );

  // Fetch mention candidates whenever the caret sits inside a @ mention.
  useEffect(() => {
    if (!mention.active) {
      setMenuDocs([]);
      setMenuOpen(false);
      setMenuLoading(false);
      setMenuError(null);
      return;
    }
    const controller = new AbortController();
    setMenuOpen(true);
    setMenuLoading(true);
    setMenuError(null);
    void fetchWorkspaceSuggestions(
      currentWorkspaceId,
      mention.query,
      SUGGESTION_LIMIT_MAX,
      controller.signal,
    ).then((result) => {
      if (controller.signal.aborted) return;
      setMenuLoading(false);
      if (result.ok) {
        setMenuDocs(result.candidates);
        setMenuOpen(true);
        setActiveIndex(0);
      } else if (result.error !== "") {
        // Aborted requests report an empty error and are discarded above.
        setMenuDocs([]);
        setMenuOpen(true);
        setMenuError(result.error);
      }
    });
    return () => controller.abort();
  }, [currentWorkspaceId, mention.active, mention.query]);

  // Keep the caret where the user left it after controlled re-renders
  // (e.g. inserting a mention replaces the @range programmatically).
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea && document.activeElement === textarea) {
      textarea.setSelectionRange(caret, caret);
    }
  }, [text, caret]);

  function closeMenu() {
    setMenuOpen(false);
    setMenuDocs([]);
    setActiveIndex(0);
  }

  function addExplicitDoc(doc: ComposerSourceDoc) {
    setExplicitDocs((docs) =>
      docs.some((existing) => existing.id === doc.id)
        ? docs
        : [...docs, doc],
    );
  }

  function selectMention(doc: ComposerSourceDoc) {
    if (!mention.active) return;
    const replaced = replaceMentionRange(
      text,
      mention.start,
      mention.end,
      `${doc.filename} `,
    );
    setText(replaced.text);
    setCaret(replaced.caret);
    addExplicitDoc(doc);
    closeMenu();
    setHint(null);
    textareaRef.current?.focus();
  }

  function removeSource(doc: ComposerSourceDoc) {
    setExplicitDocs((docs) =>
      docs.filter((existing) => existing.id !== doc.id),
    );
    setText((current) => stripMentionText(current, doc.filename));
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
    setCaret(event.target.selectionStart);
    setPromptError(null);
    setSubmitError(null);
    setHint(null);
  }

  function handleSelect(event: React.SyntheticEvent<HTMLTextAreaElement>) {
    setCaret(event.currentTarget.selectionStart);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (menuOpen && menuDocs.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, menuDocs.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const doc = menuDocs[activeIndex];
        if (doc) selectMention(doc);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  function resetComposer() {
    setText("");
    setCaret(0);
    setExplicitDocs([]);
    setMenuDocs([]);
    setMenuOpen(false);
    setActiveIndex(0);
    setPromptError(null);
    setSubmitError(null);
    setHint(null);
    textareaRef.current?.focus();
  }

  async function handleSubmit() {
    if (submitting || confirming || confirmation !== null) return;
    const prompt = text.trim();
    if (prompt === "") {
      setPromptError("Add a prompt describing the worksheet you want.");
      return;
    }
    if (prompt.length > MAX_TEACHER_PROMPT_CHARS) {
      setPromptError(
        `Your prompt is too long (max ${MAX_TEACHER_PROMPT_CHARS} characters).`,
      );
      return;
    }
    setPromptError(null);
    setSubmitError(null);
    closeMenu();
    setSubmitting(true);
    const result = await fetchWorkspaceSuggestions(
      currentWorkspaceId,
      prompt,
      SUGGESTION_LIMIT_MAX,
    );
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    // No generation yet: the teacher confirms explicit + suggested sources
    // before anything is generated.
    setConfirmation(buildConfirmationSources(explicitDocs, result.candidates));
  }

  function toggleInclude(docId: string) {
    setConfirmation((sources) =>
      sources ? toggleConfirmationSource(sources, docId) : sources,
    );
  }

  function setSuggestedIncluded(included: boolean) {
    setConfirmation((sources) =>
      sources ? setSuggestedSourcesIncluded(sources, included) : sources,
    );
  }

  function addMoreFromPanel() {
    setConfirmation(null);
    setSubmitError(null);
    setGenerationError(null);
    setMigrationPending(false);
    setHint("Type @ followed by a filename to add more sources, then send again.");
    textareaRef.current?.focus();
  }

  async function handleConfirm() {
    if (!confirmation || confirming) return;
    const materialIds = includedReadySourceIds(confirmation);
    if (materialIds.length === 0) return;
    const confirmedMaterialIds = confirmation
      .filter(
        (source) =>
          source.origin === "explicit" &&
          source.included &&
          isReadySourceDoc(source.doc),
      )
      .map((source) => source.doc.id);
    setConfirming(true);
    setGenerationError(null);
    setMigrationPending(false);
    const outcome = await requestWorkspaceGeneration(currentWorkspaceId, {
      prompt: text.trim(),
      materialIds,
      confirmedMaterialIds,
    });
    setConfirming(false);
    if (outcome.ok) {
      setGenerated(outcome.material);
      setDriveSaved(null);
      setDriveError(null);
      setConfirmation(null);
      resetComposer();
      onGenerated(outcome.material);
    } else {
      setGenerationError(outcome.error);
      setMigrationPending(outcome.migrationPending);
    }
  }

  async function saveGeneratedToDrive() {
    if (!generated || driveSaving) return;
    setDriveSaving(true);
    setDriveError(null);
    setDriveSaved(null);
    try {
      const token = await readGoogleProviderToken();
      const config = readGooglePickerPublicConfig({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY,
        cloudProjectNumber: process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER,
      });
      if (!token || !config) {
        setDriveError(
          "Google Drive isn't connected to this sign-in. Sign out and back in after granting Drive access, then try again.",
        );
        return;
      }
      await loadGooglePicker();
      await new Promise<void>((resolve) => {
        openGoogleDrivePicker({
          config,
          token,
          mode: "folders",
          onCanceled: resolve,
          onError: (message) => {
            setDriveError(message);
            resolve();
          },
          onPicked: async (picks) => {
            const folder = picks.find((pick) => pick.kind === "folder");
            if (!folder) {
              setDriveError("Choose a Google Drive folder for this Material.");
              resolve();
              return;
            }
            const upload = await uploadWorksheetToDrive({
              token,
              folderId: folder.id,
              worksheet: generated.worksheet,
              title: generated.worksheet.title,
            });
            if (!upload.ok) {
              setDriveError(upload.error);
              resolve();
              return;
            }
            const syncResponse = await fetch(
              `/api/teachers/generated-materials/${encodeURIComponent(generated.generatedMaterialId)}/drive-sync`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  driveFileId: upload.fileId,
                  status: "synced",
                }),
              },
            );
            const syncBody = (await syncResponse.json().catch(() => null)) as
              | { error?: unknown }
              | null;
            if (!syncResponse.ok) {
              setDriveError(
                typeof syncBody?.error === "string"
                  ? syncBody.error
                  : "The file was uploaded, but TutorMonkey couldn't record its Drive link.",
              );
              resolve();
              return;
            }
            setDriveSaved({ name: upload.name, webViewLink: upload.webViewLink });
            resolve();
          },
        });
      });
    } catch {
      setDriveError("Google Drive couldn't be opened — please try again.");
    } finally {
      setDriveSaving(false);
    }
  }

  function startAnother() {
    setGenerated(null);
    setDriveSaved(null);
    setDriveError(null);
    setGenerationError(null);
    setMigrationPending(false);
    resetComposer();
  }

  const explicitSources = confirmation?.filter(
    (source) => source.origin === "explicit",
  );
  const suggestedSources = confirmation?.filter(
    (source) => source.origin === "suggested",
  );
  const readyIncludedCount = confirmation
    ? includedReadySourceIds(confirmation).length
    : 0;
  const canConfirm = confirmation ? canConfirmGeneration(confirmation) : false;

  // --------------------------------------------------------------- result --
  if (generated) {
    const questionCount = generated.worksheet.questions.length;
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-green-200 bg-green-50/60 p-6"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2
            className="mt-0.5 h-6 w-6 shrink-0 text-green-700"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900">
              {generated.worksheet.title}
            </h3>
            <p className="mt-1 text-sm text-gray-600 font-light">
              {questionCount} question{questionCount === 1 ? "" : "s"}
              {generated.model !== "unknown"
                ? ` · ${generated.model}`
                : ""}
              {generated.generatedAt !== ""
                ? ` · ${shortDate(generated.generatedAt)}`
                : ""}
            </p>
            {generated.truncatedSource && (
              <p className="mt-1 text-xs text-gray-500 font-light">
                Source text was truncated for generation.
              </p>
            )}
            <p className="mt-2 text-sm text-gray-600 font-light">
              Generated on the server from your selected documents and saved
              as a material in this workspace.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void saveGeneratedToDrive()}
                disabled={driveSaving}
                className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {driveSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CloudUpload className="h-4 w-4" aria-hidden="true" />
                )}
                {driveSaving ? "Saving to Drive…" : "Save to Google Drive"}
              </button>
              {driveSaved?.webViewLink && (
                <a
                  href={driveSaved.webViewLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 underline underline-offset-4"
                >
                  {driveSaved.name}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
            {driveSaved && !driveSaved.webViewLink && (
              <p className="mt-2 text-xs text-green-800">
                Saved to Google Drive as {driveSaved.name}.
              </p>
            )}
            {driveError && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {driveError}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={startAnother}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-800 shadow-sm transition-all duration-300 hover:bg-green-50 hover:shadow-md"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Generate another worksheet
        </button>
      </div>
    );
  }

  // ------------------------------------------------------- confirmation ----
  if (confirmation) {
    return (
      <div
        role="region"
        aria-label="Confirm sources"
        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">
              Confirm sources
            </h3>
            <p className="mt-0.5 truncate text-sm text-gray-500 font-light">
              Prompt: “{text.trim()}”
            </p>
          </div>
          <button
            type="button"
            onClick={addMoreFromPanel}
            aria-label="Close confirmation and edit the prompt"
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {generationError && (
          <p
            role="alert"
            className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-light ${
              migrationPending
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            {generationError}
          </p>
        )}

        {confirmation.length === 0 && (
          <p className="mb-4 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-500 font-light">
            No source documents found yet — type{" "}
            <span className="font-medium text-gray-800">@</span> to mention a
            document from this workspace, or add a more specific prompt.
          </p>
        )}

        {explicitSources && explicitSources.length > 0 && (
          <section aria-labelledby="composer-explicit-heading" className="mb-5">
            <h4
              id="composer-explicit-heading"
              className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400"
            >
              Your selected sources · {explicitSources.length}
            </h4>
            <ul role="list" className="space-y-2">
              {explicitSources.map((source) => (
                <SourceRow
                  key={source.doc.id}
                  source={source}
                  onToggle={toggleInclude}
                />
              ))}
            </ul>
          </section>
        )}

        {suggestedSources && suggestedSources.length > 0 && (
          <section aria-labelledby="composer-suggested-heading" className="mb-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4
                id="composer-suggested-heading"
                className="text-xs font-semibold uppercase tracking-wide text-gray-400"
              >
                Suggested sources · {suggestedSources.length}
              </h4>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSuggestedIncluded(true)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  Include all
                </button>
                <button
                  type="button"
                  onClick={() => setSuggestedIncluded(false)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  Exclude all
                </button>
              </div>
            </div>
            <ul role="list" className="space-y-2">
              {suggestedSources.map((source) => (
                <SourceRow
                  key={source.doc.id}
                  source={source}
                  onToggle={toggleInclude}
                />
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={addMoreFromPanel}
            className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-300 hover:bg-gray-50 hover:shadow-md"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            Add more with @
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm || confirming}
            className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:bg-gray-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirming ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            )}
            {confirming
              ? "Generating…"
              : `Confirm sources & generate${
                  readyIncludedCount > 0 ? ` (${readyIncludedCount})` : ""
                }`}
          </button>
        </div>
        {!canConfirm && !confirming && (
          <p className="mt-3 text-xs text-gray-500 font-light">
            At least one ready document must be included before generation can
            start.
          </p>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------- composer --
  const canSend = text.trim() !== "" && !submitting;
  return (
    <div className="relative">
      {menuOpen && (
        <div
          id={MENTION_LISTBOX_ID}
          role="listbox"
          aria-label="Source documents"
          className="absolute bottom-full left-0 right-0 z-10 mb-2 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl"
        >
          {menuLoading && (
            <p
              role="status"
              className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500 font-light"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading documents…
            </p>
          )}
          {!menuLoading && menuError && (
            <p
              role="alert"
              className="flex items-start gap-2 px-4 py-3 text-sm text-red-600 font-light"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              {menuError}
            </p>
          )}
          {!menuLoading && !menuError && menuDocs.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-500 font-light">
              No matching documents in this workspace.
            </p>
          )}
          {!menuLoading &&
            !menuError &&
            menuDocs.map((doc, index) => (
              <button
                key={doc.id}
                type="button"
                role="option"
                id={optionId(index)}
                aria-selected={index === activeIndex}
                onClick={() => selectMention(doc)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center gap-2 border-b border-gray-100 px-4 py-2.5 text-left transition-colors last:border-b-0 ${
                  index === activeIndex ? "bg-gray-100" : "bg-white hover:bg-gray-50"
                }`}
              >
                <FileText
                  className="h-4 w-4 shrink-0 text-gray-400"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {doc.filename}
                  </span>
                  {doc.folderSegments.length > 0 && (
                    <span className="block truncate text-xs text-gray-400 font-light">
                      {doc.folderSegments.join(" / ")}
                    </span>
                  )}
                </span>
                <MaterialStatusBadge status={doc.status} />
              </button>
            ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        {hint && (
          <p className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800 font-light">
            {hint}
          </p>
        )}
        {promptError && (
          <p
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 font-light"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            {promptError}
          </p>
        )}
        {submitError && (
          <p
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 font-light"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            {submitError}
          </p>
        )}

        {explicitDocs.length > 0 && (
          <div
            role="list"
            aria-label="Selected source documents"
            className="mb-3 flex flex-wrap gap-2"
          >
            {explicitDocs.map((doc) => (
              <span
                key={doc.id}
                role="listitem"
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 py-1 pl-3 pr-1 text-xs text-gray-700"
              >
                <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate font-medium">{doc.filename}</span>
                <button
                  type="button"
                  onClick={() => removeSource(doc)}
                  aria-label={`Remove source ${doc.filename}`}
                  className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          role="combobox"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? MENTION_LISTBOX_ID : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            menuOpen && activeIndex >= 0 && menuDocs.length > 0
              ? optionId(activeIndex)
              : undefined
          }
          aria-label="Prompt for the worksheet generator"
          value={text}
          onChange={handleChange}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          placeholder="Describe the worksheet you want — e.g. “A 10-question quiz on enzymes from my class notes” — and type @ to attach source documents from this workspace."
          rows={6}
          className="w-full resize-y rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm leading-6 text-gray-900 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-400 font-light">
            Type <span className="font-medium text-gray-600">@</span> to
            mention a document. Only document metadata is used here — source
            text stays on the server.
          </p>
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Choose sources and prepare generation"
            className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-300 hover:bg-gray-800 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            {submitting ? "Finding sources…" : "Choose sources"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** One include/exclude row inside the confirmation panel. */
function SourceRow({
  source,
  onToggle,
}: {
  source: ConfirmationSource;
  onToggle: (docId: string) => void;
}) {
  const ready = isReadySourceDoc(source.doc);
  return (
    <li className="rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={source.included}
          disabled={!ready}
          onChange={() => onToggle(source.doc.id)}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 disabled:cursor-not-allowed"
        />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span
              className="truncate text-sm font-medium text-gray-900"
              title={source.doc.filename}
            >
              {source.doc.filename}
            </span>
            <MaterialStatusBadge status={source.doc.status} />
            {source.origin === "suggested" ? (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                Suggested
              </span>
            ) : (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                You selected
              </span>
            )}
          </span>
          {source.doc.folderSegments.length > 0 && (
            <span className="mt-0.5 block text-xs text-gray-400 font-light">
              {source.doc.folderSegments.join(" / ")}
            </span>
          )}
          {!ready && (
            <span className="mt-0.5 block text-xs text-amber-700 font-light">
              Not ready yet — extracted text is needed before this document can
              be used for generation.
            </span>
          )}
        </span>
      </label>
    </li>
  );
}
