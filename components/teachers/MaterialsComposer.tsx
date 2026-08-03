"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Check, FileText, Loader2, Plus } from "lucide-react";
import {
  findMentionAtCaret,
  isReadySourceDoc,
  type ComposerSourceDoc,
  SUGGESTION_LIMIT_MAX,
} from "@/lib/teachers/materialsComposer";
import { MAX_TEACHER_PROMPT_CHARS } from "@/lib/teachers/generateRequest";
import { shortDate } from "@/lib/teachers/materialDetail";
import {
  fetchWorkspaceSuggestions,
  requestWorkspaceGeneration,
  type GeneratedComposerMaterial,
} from "@/lib/teachers/workspaceComposerClient";
import { hydrateDriveMaterial } from "@/lib/teachers/googleDriveImportClient";
import {
  loadGooglePicker,
  openGoogleDrivePicker,
  readGoogleProviderToken,
} from "@/lib/teachers/googlePickerClient";
import { readGooglePickerPublicConfig } from "@/lib/teachers/googlePicker";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uploadWorksheetToDrive } from "@/lib/teachers/driveSaveClient";

type MentionPart = { kind: "mention"; doc: ComposerSourceDoc };
type TextPart = { kind: "text"; value: string };
type EditorPart = MentionPart | TextPart;

type MaterialsComposerProps = {
  currentWorkspaceId: string;
  onGenerated: (material: GeneratedComposerMaterial) => void;
};

const emptyParts: EditorPart[] = [{ kind: "text", value: "" }];

function partText(part: EditorPart): string {
  return part.kind === "mention" ? `@${part.doc.filename}` : part.value;
}

function partsText(parts: readonly EditorPart[]): string {
  return parts.map(partText).join("");
}

function normalizeParts(parts: EditorPart[]): EditorPart[] {
  const next: EditorPart[] = [];
  for (const part of parts) {
    if (part.kind === "text" && part.value === "" && next.length > 0) continue;
    if (part.kind === "text" && next.at(-1)?.kind === "text") {
      const previous = next.at(-1) as TextPart;
      previous.value += part.value;
    } else {
      next.push(part);
    }
  }
  return next.length > 0 ? next : emptyParts;
}

function readParts(root: HTMLDivElement, docs: readonly ComposerSourceDoc[]): EditorPart[] {
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  return normalizeParts(
    Array.from(root.childNodes).map((node): EditorPart => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const id = (node as HTMLElement).dataset.mentionId;
        const doc = id ? byId.get(id) : undefined;
        if (doc) return { kind: "mention", doc };
      }
      return { kind: "text", value: node.textContent ?? "" };
    }),
  );
}

function caretOffset(root: HTMLDivElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode) return 0;
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(root);
  range.setEnd(selection.anchorNode, selection.anchorOffset);
  return range.toString().length;
}

function placeCaretAtEnd(root: HTMLDivElement) {
  root.focus();
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function replaceMention(
  parts: readonly EditorPart[],
  start: number,
  end: number,
  doc: ComposerSourceDoc,
): EditorPart[] {
  const output: EditorPart[] = [];
  let cursor = 0;
  let inserted = false;
  for (const part of parts) {
    const value = partText(part);
    const partStart = cursor;
    const partEnd = cursor + value.length;
    cursor = partEnd;
    if (inserted || end <= partStart || start >= partEnd) {
      output.push(part);
      continue;
    }
    if (part.kind !== "text") {
      output.push(part);
      continue;
    }
    const localStart = Math.max(0, start - partStart);
    const localEnd = Math.min(value.length, end - partStart);
    if (localStart > 0) output.push({ kind: "text", value: value.slice(0, localStart) });
    output.push({ kind: "mention", doc }, { kind: "text", value: " " });
    if (localEnd < value.length) output.push({ kind: "text", value: value.slice(localEnd) });
    inserted = true;
  }
  return normalizeParts(inserted ? output : [...parts, { kind: "mention", doc }, { kind: "text", value: " " }]);
}

function removeMentionBeforeCaret(parts: readonly EditorPart[], offset: number): EditorPart[] | null {
  let cursor = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const end = cursor + partText(part).length;
    if (part.kind === "mention" && end === offset) {
      return normalizeParts([...parts.slice(0, index), ...parts.slice(index + 1)]);
    }
    cursor = end;
  }
  return null;
}

export function MaterialsComposer({ currentWorkspaceId, onGenerated }: MaterialsComposerProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [parts, setParts] = useState<EditorPart[]>(emptyParts);
  const [caret, setCaret] = useState(0);
  const [docs, setDocs] = useState<ComposerSourceDoc[]>([]);
  const [suggestions, setSuggestions] = useState<ComposerSourceDoc[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedComposerMaterial | null>(null);
  const [confirmation, setConfirmation] = useState<{ prompt: string; explicit: ComposerSourceDoc[]; suggested: ComposerSourceDoc[] } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [driveSaving, setDriveSaving] = useState(false);
  const [driveSaved, setDriveSaved] = useState<string | null>(null);

  const text = useMemo(() => partsText(parts), [parts]);
  const mention = useMemo(() => findMentionAtCaret(text, caret), [text, caret]);
  const selectedDocs = useMemo(
    () => parts.filter((part): part is MentionPart => part.kind === "mention").map((part) => part.doc),
    [parts],
  );
  const canUseSource = (doc: ComposerSourceDoc) => isReadySourceDoc(doc) || doc.sourceType === "google_drive";

  useEffect(() => {
    const controller = new AbortController();
    void fetchWorkspaceSuggestions(currentWorkspaceId, "", SUGGESTION_LIMIT_MAX, controller.signal).then((result) => {
      if (!controller.signal.aborted && result.ok) {
        setDocs((current) => [...current, ...result.candidates.filter((doc) => !current.some((item) => item.id === doc.id))]);
      }
    });
    return () => controller.abort();
  }, [currentWorkspaceId]);

  useEffect(() => {
    if (!mention.active) {
      setMenuOpen(false);
      return;
    }
    const controller = new AbortController();
    setMenuOpen(true);
    setLoadingSuggestions(true);
    void fetchWorkspaceSuggestions(currentWorkspaceId, mention.query, SUGGESTION_LIMIT_MAX, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setLoadingSuggestions(false);
      if (result.ok) {
        setDocs((current) => [...current, ...result.candidates.filter((doc) => !current.some((item) => item.id === doc.id))]);
        setSuggestions(result.candidates);
        setActiveIndex(0);
      }
    });
    return () => controller.abort();
  }, [currentWorkspaceId, mention.active, mention.query]);

  function syncEditor() {
    if (!editorRef.current) return;
    const nextParts = readParts(editorRef.current, docs);
    setParts(nextParts);
    setCaret(caretOffset(editorRef.current));
  }

  function selectSuggestion(doc: ComposerSourceDoc) {
    const nextParts = replaceMention(parts, mention.start, mention.end, doc);
    setDocs((current) => current.some((item) => item.id === doc.id) ? current : [...current, doc]);
    setParts(nextParts);
    setSuggestions([]);
    setMenuOpen(false);
    requestAnimationFrame(() => {
      if (!editorRef.current) return;
      editorRef.current.innerHTML = "";
      nextParts.forEach((part, index) => editorRef.current?.appendChild(renderDomPart(part, index)));
      placeCaretAtEnd(editorRef.current);
      setCaret(partsText(nextParts).length);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (menuOpen && suggestions.length > 0) {
      if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((value) => Math.min(value + 1, suggestions.length - 1)); return; }
      if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((value) => Math.max(value - 1, 0)); return; }
      if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); selectSuggestion(suggestions[activeIndex]); return; }
      if (event.key === "Escape") { event.preventDefault(); setMenuOpen(false); return; }
    }
    if (event.key === "Backspace" && editorRef.current) {
      const offset = caretOffset(editorRef.current);
      const next = removeMentionBeforeCaret(parts, offset);
      if (next) {
        event.preventDefault();
        setParts(next);
        requestAnimationFrame(() => {
          if (editorRef.current) {
            editorRef.current.innerHTML = "";
            next.forEach((part, index) => editorRef.current?.appendChild(renderDomPart(part, index)));
            placeCaretAtEnd(editorRef.current);
          }
        });
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void prepareGeneration();
    }
  }

  async function prepareGeneration() {
    if (generating || confirming) return;
    const prompt = text.trim();
    if (!prompt || prompt.length > MAX_TEACHER_PROMPT_CHARS) return;
    setGenerating(true);
    const result = await fetchWorkspaceSuggestions(currentWorkspaceId, prompt, SUGGESTION_LIMIT_MAX);
    setGenerating(false);
    if (!result.ok) return;
    const explicitIds = new Set(selectedDocs.map((doc) => doc.id));
    const suggested = result.candidates.filter((doc) => !explicitIds.has(doc.id) && canUseSource(doc)).slice(0, 4);
    setConfirmation({ prompt, explicit: selectedDocs, suggested });
  }

  async function confirmGeneration() {
    if (!confirmation || confirming) return;
    setConfirming(true);
    const candidates = [...confirmation.explicit, ...confirmation.suggested].filter(canUseSource);
    const driveToken = await readGoogleProviderToken();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setConfirming(false); return; }
    for (const doc of candidates) {
      if (!isReadySourceDoc(doc) && doc.sourceType === "google_drive") {
        if (!driveToken || !(await hydrateDriveMaterial({ token: driveToken, materialId: doc.id, workspaceId: currentWorkspaceId, supabase }))) {
          setConfirming(false);
          return;
        }
      }
    }
    const materialIds = Array.from(new Set(candidates.map((doc) => doc.id)));
    const result = await requestWorkspaceGeneration(currentWorkspaceId, {
      prompt: confirmation.prompt,
      materialIds,
      confirmedMaterialIds: materialIds,
    });
    setConfirming(false);
    if (result.ok) {
      setGenerated(result.material);
      setConfirmation(null);
      onGenerated(result.material);
    }
  }

  async function saveToDrive() {
    if (!generated || driveSaving) return;
    setDriveSaving(true);
    setDriveSaved(null);
    try {
      const token = await readGoogleProviderToken();
      const config = readGooglePickerPublicConfig({ apiKey: process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY, cloudProjectNumber: process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER });
      if (!token || !config) return;
      await loadGooglePicker();
      await new Promise<void>((resolve) => openGoogleDrivePicker({
        token,
        config,
        mode: "folders",
        onCanceled: resolve,
        onError: () => resolve(),
        onPicked: async (picks) => {
          const folder = picks.find((pick) => pick.kind === "folder");
          if (!folder) { resolve(); return; }
          const upload = await uploadWorksheetToDrive({ token, folderId: folder.id, worksheet: generated.worksheet, title: generated.worksheet.title });
          if (upload.ok) {
            await fetch(`/api/teachers/generated-materials/${generated.generatedMaterialId}/drive-sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driveFileId: upload.fileId, status: "synced" }) });
            setDriveSaved(upload.name);
          }
          resolve();
        },
      }));
    } finally {
      setDriveSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-10 text-center">
        <h2 className="text-4xl font-medium tracking-tight text-gray-900">What would you like to create?</h2>
        <p className="mt-3 text-sm text-gray-500">Mention a document with @, or describe what you need.</p>
      </div>
      <div className="relative">
        {menuOpen && (
          <div role="listbox" aria-label="Document suggestions" className="absolute bottom-full left-0 right-0 z-20 mb-3 max-h-64 overflow-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
            {loadingSuggestions && <div className="px-3 py-2 text-sm text-gray-500">Searching documents…</div>}
            {!loadingSuggestions && suggestions.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">No matching documents</div>}
            {suggestions.map((doc, index) => (
              <button key={doc.id} type="button" role="option" aria-selected={activeIndex === index} onMouseDown={(event) => { event.preventDefault(); selectSuggestion(doc); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${activeIndex === index ? "bg-gray-100" : "hover:bg-gray-50"}`}>
                <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{doc.filename}</span>
                <span className="text-xs text-gray-400">{doc.status}</span>
              </button>
            ))}
          </div>
        )}
        <div className="rounded-3xl border border-gray-300 bg-white p-3 shadow-sm transition-shadow focus-within:border-gray-500 focus-within:shadow-md">
          <div className="flex items-end gap-3">
            <button type="button" aria-label="Add a document mention" onClick={() => { editorRef.current?.focus(); }} className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><Plus className="h-5 w-5" /></button>
            <div
              ref={editorRef}
              contentEditable
              role="textbox"
              aria-label="Describe the material to generate"
              aria-multiline="true"
              data-placeholder="Ask TutorMonkey to create a material…"
              suppressContentEditableWarning
              onInput={syncEditor}
              onKeyDown={handleKeyDown}
              onKeyUp={() => editorRef.current && setCaret(caretOffset(editorRef.current))}
              onClick={() => editorRef.current && setCaret(caretOffset(editorRef.current))}
              className="min-h-12 max-h-40 flex-1 overflow-y-auto whitespace-pre-wrap px-1 py-2 text-base leading-6 text-gray-900 outline-none empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)]"
            >
            </div>
            <button type="button" aria-label="Generate material" onClick={() => void prepareGeneration()} disabled={generating || text.trim() === ""} className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400">
              {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between px-12 text-[11px] text-gray-400">
            <span>{selectedDocs.length > 0 ? `${selectedDocs.length} document${selectedDocs.length === 1 ? "" : "s"} attached` : "Use @ to attach a document"}</span>
            <span>Enter to generate · Shift+Enter for a new line</span>
          </div>
        </div>
      </div>
      {confirmation && (
        <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Confirm documents</h3>
              <p className="mt-1 text-xs text-gray-500">These documents will be used to create your material.</p>
            </div>
            <button type="button" onClick={() => setConfirmation(null)} aria-label="Cancel document confirmation" className="text-gray-400 hover:text-gray-700">×</button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Tagged documents</p>
              {confirmation.explicit.length > 0 ? confirmation.explicit.map((doc) => <div key={doc.id} className="flex items-center gap-2 py-1 text-sm text-gray-800"><FileText className="h-4 w-4 text-indigo-500" />{doc.filename}</div>) : <p className="text-sm text-gray-400">None tagged</p>}
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Suggested documents</p>
              {confirmation.suggested.length > 0 ? confirmation.suggested.map((doc) => <div key={doc.id} className="flex items-center gap-2 py-1 text-sm text-gray-800"><FileText className="h-4 w-4 text-gray-400" />{doc.filename}</div>) : <p className="text-sm text-gray-400">No related documents found</p>}
            </div>
          </div>
          <button type="button" onClick={() => void confirmGeneration()} disabled={confirming || [...confirmation.explicit, ...confirmation.suggested].filter(canUseSource).length === 0} className="mt-5 inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400">{confirming && <Loader2 className="h-4 w-4 animate-spin" />}Generate material</button>
        </div>
      )}
      {generated && (
        <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Generated material</p>
              <h3 className="mt-1 text-lg font-semibold text-gray-900">{generated.worksheet.title}</h3>
              <p className="mt-1 text-sm text-gray-500">{generated.worksheet.questions.length} questions · {shortDate(generated.generatedAt)}</p>
            </div>
            <button type="button" onClick={() => void saveToDrive()} disabled={driveSaving} className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60">{driveSaving ? "Saving…" : driveSaved ? <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span> : "Save to Drive"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function renderDomPart(part: EditorPart, index: number): Node {
  if (part.kind === "text") return document.createTextNode(part.value);
  const span = document.createElement("span");
  span.dataset.mentionId = part.doc.id;
  span.contentEditable = "false";
  span.className = "mx-0.5 inline-flex select-none items-center rounded-md bg-indigo-100 px-1.5 py-0.5 align-baseline text-sm font-medium text-indigo-700";
  span.textContent = `@${part.doc.filename}`;
  span.setAttribute("data-part-index", String(index));
  return span;
}
