"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TeachersSchemaStatus } from "@/hooks/useTeachersSchemaStatus";
import {
  toGeneratedMaterialEntry,
  type GeneratedMaterialEntry,
  type GeneratedMaterialRowLike,
  type WorkspaceSummary,
} from "@/lib/teachers/fileBrowser";
import { parseExtractionCount, shortDate, type MaterialStatus } from "@/lib/teachers/materialDetail";
import { buildWorksheetDriveFileName, buildWorksheetMarkdown } from "@/lib/teachers/materialsComposer";
import { requestWorksheetGeneration, type GenerateWorksheetOutcome } from "@/lib/teachers/generateClient";
import { MaterialsComposer } from "@/components/teachers/MaterialsComposer";
import { MaterialDetailModal, type MaterialSummary } from "@/components/teachers/MaterialDetailModal";
import type { GeneratedComposerMaterial } from "@/lib/teachers/workspaceComposerClient";

type MaterialRow = {
  id: string;
  workspace_id: string;
  original_filename: string;
  byte_size: number | null;
  status: MaterialStatus;
  char_count: unknown;
  message: string | null;
  created_at: string;
  worksheet: unknown;
};

type GeneratedMaterialListRow = {
  id: string;
  title: string;
  status: "generating" | "completed" | "failed";
  error: string | null;
  content: GeneratedComposerMaterial["worksheet"];
  provider: string | null;
  model: string | null;
  created_at: string;
};
type MaterialsViewProps = {
  schemaStatus: TeachersSchemaStatus;
  currentWorkspace: WorkspaceSummary | null;
  onSwitchToDocuments?: () => void;
};

export function MaterialsView({ schemaStatus, currentWorkspace }: MaterialsViewProps) {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailMaterial, setDetailMaterial] = useState<MaterialSummary | null>(null);
  const [recentGenerated, setRecentGenerated] = useState<GeneratedComposerMaterial[]>([]);
  const [generatedRows, setGeneratedRows] = useState<GeneratedMaterialListRow[]>([]);
  const isReady = schemaStatus === "ready";

  const loadMaterials = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !currentWorkspace) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("materials")
        .select("id, workspace_id, original_filename, byte_size, status, created_at, provenance->worksheet, provenance->extraction->>char_count, provenance->last_error->>message")
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        setLoadError("Couldn't load this workspace's materials — please refresh.");
        return;
      }
      setRows(data?.map((row) => ({
        id: row.id as string,
        workspace_id: row.workspace_id as string,
        original_filename: row.original_filename as string,
        byte_size: row.byte_size as number | null,
        status: row.status as MaterialStatus,
        char_count: row.char_count,
        message: typeof row.message === "string" && row.message.trim() !== "" ? row.message : null,
        created_at: row.created_at as string,
        worksheet: row.worksheet,
      })) ?? []);
      const { data: generated, error: generatedError } = await supabase
        .from("generated_materials")
        .select("id, title, content, provider, model, created_at, generation_status, generation_error")
        .eq("workspace_id", currentWorkspace.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (generatedError) {
        setLoadError("Couldn't load generated materials — please refresh.");
        return;
      }
      setGeneratedRows((generated ?? []).map((row) => ({
        id: row.id as string,
        title: typeof row.title === "string" ? row.title : "Generated material",
        status: row.generation_status === "failed" || row.generation_status === "generating" ? row.generation_status : "completed",
        error: typeof row.generation_error === "string" ? row.generation_error : null,
        content: (row.content && typeof row.content === "object" ? row.content : { title: "Generating material…", questions: [] }) as GeneratedComposerMaterial["worksheet"],
        provider: typeof row.provider === "string" ? row.provider : null,
        model: typeof row.model === "string" ? row.model : null,
        created_at: row.created_at as string,
      })));
    } catch {
      setLoadError("Couldn't load this workspace's materials — please refresh.");
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    if (isReady && currentWorkspace) void loadMaterials();
    else setRows([]);
  }, [isReady, currentWorkspace, loadMaterials]);

  useEffect(() => {
    if (!isReady || !currentWorkspace) return;
    const interval = window.setInterval(() => void loadMaterials(), 5000);
    return () => window.clearInterval(interval);
  }, [isReady, currentWorkspace, loadMaterials]);

  useEffect(() => {
    setDetailMaterial(null);
    setRecentGenerated([]);
    setGeneratedRows([]);
  }, [currentWorkspace?.id]);

  const entries = useMemo<GeneratedMaterialEntry[]>(() => rows
    .map((row) => toGeneratedMaterialEntry({ id: row.id, original_filename: row.original_filename, worksheet: row.worksheet as GeneratedMaterialRowLike["worksheet"] }))
    .filter((entry): entry is GeneratedMaterialEntry => entry !== null), [rows]);
  const generatedEntries = entries.filter((entry) => entry.kind === "generated");

  async function runGeneration(materialId: string): Promise<GenerateWorksheetOutcome> {
    const outcome = await requestWorksheetGeneration(materialId);
    if (outcome.ok) await loadMaterials();
    return outcome;
  }

  function openReview(row: MaterialRow) {
    setDetailMaterial({
      id: row.id,
      original_filename: row.original_filename,
      byte_size: row.byte_size,
      status: row.status,
      charCount: parseExtractionCount(row.char_count),
      lastErrorMessage: row.message,
      created_at: row.created_at,
      workspace_title: currentWorkspace?.title ?? "Workspace",
    });
  }

  function addRecentMaterial(material: GeneratedComposerMaterial) {
    setRecentGenerated((current) => [material, ...current.filter((item) => item.generatedMaterialId !== material.generatedMaterialId)]);
    void loadMaterials();
  }

  function downloadWorksheet(worksheet: GeneratedComposerMaterial["worksheet"]) {
    const blob = new Blob([buildWorksheetMarkdown(worksheet)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildWorksheetDriveFileName(worksheet);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section aria-label="Materials" className="min-h-full px-4 py-16 sm:px-8 lg:px-12">
      {schemaStatus === "not-applied" && (
        <p className="mx-auto mb-8 max-w-3xl text-center text-xs text-gray-400">Materials are unavailable until the Teachers database migration is applied.</p>
      )}
      {isReady && currentWorkspace && <MaterialsComposer currentWorkspaceId={currentWorkspace.id} onGenerated={addRecentMaterial} />}
      {currentWorkspace && loading && <div className="mx-auto mt-16 flex justify-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>}
      {loadError && <p role="alert" className="mx-auto mt-8 max-w-3xl text-center text-sm text-gray-500">{loadError}</p>}

      {(recentGenerated.length > 0 || generatedRows.length > 0 || generatedEntries.length > 0) && (
        <div className="mx-auto mt-28 max-w-3xl border-t border-gray-200 pt-8">
          <h2 className="mb-5 text-sm font-medium text-gray-500">Generated materials</h2>
          <div className="space-y-2">
            {generatedRows.map((material) => {
              const isGenerating = material.status === "generating";
              const isFailed = material.status === "failed";
              return (
                <div key={material.id} className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{material.title}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {isGenerating ? "Generating your material…" : isFailed ? (material.error ?? "Generation failed — try again.") : `${Array.isArray(material.content.questions) ? material.content.questions.length : 0} questions · ${shortDate(material.created_at)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className={`flex items-center gap-1.5 text-xs ${isFailed ? "text-rose-600" : "text-gray-400"}`}>
                      {isGenerating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {isGenerating ? "Generating" : isFailed ? "Failed" : "Generated"}
                    </span>
                    {!isGenerating && !isFailed && <button type="button" onClick={() => downloadWorksheet(material.content)} aria-label={`Download ${material.title}`} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900"><Download className="h-3.5 w-3.5" />Download</button>}
                  </div>
                </div>
              );
            })}
            {recentGenerated.filter((material) => !generatedRows.some((row) => row.id === material.generatedMaterialId)).map((material) => (
              <div key={material.generatedMaterialId} className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-gray-900">{material.worksheet.title}</p><p className="mt-1 text-xs text-gray-500">{material.worksheet.questions.length} questions · {shortDate(material.generatedAt)}</p></div>
                <button type="button" onClick={() => downloadWorksheet(material.worksheet)} aria-label={`Download ${material.worksheet.title}`} className="inline-flex shrink-0 items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900"><Download className="h-3.5 w-3.5" />Download</button>
              </div>
            ))}
            {generatedEntries.map((entry) => {
              if (entry.kind !== "generated") return null;
              const row = rows.find((item) => item.id === entry.materialId);
              return <div key={entry.id} className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-900">{entry.title}</p><p className="mt-1 text-xs text-gray-500">{entry.questionCount} questions{entry.generatedAt ? ` · ${shortDate(entry.generatedAt)}` : ""}</p></div><div className="flex shrink-0 items-center gap-3">{row && <button type="button" onClick={() => openReview(row)} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900"><Eye className="h-3.5 w-3.5" />Open</button>}{row !== undefined && typeof row.worksheet === "object" && row.worksheet !== null && <button type="button" onClick={() => downloadWorksheet(row.worksheet as GeneratedComposerMaterial["worksheet"])} aria-label={`Download ${entry.title}`} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900"><Download className="h-3.5 w-3.5" />Download</button>}</div></div>;
            })}
          </div>
        </div>
      )}
      {detailMaterial && <MaterialDetailModal material={detailMaterial} schemaStatus={schemaStatus} onClose={() => setDetailMaterial(null)} onGenerate={runGeneration} />}
    </section>
  );
}
