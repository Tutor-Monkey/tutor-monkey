"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
} from "lucide-react";
import type { MaterialStatus } from "@/lib/teachers/materialDetail";

/**
 * Status pill for a teacher material, shared by the material library list
 * and the material review modal so both views render the same four states
 * (uploaded / extracting / ready / failed) identically.
 */
export function MaterialStatusBadge({ status }: { status: MaterialStatus }) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-800">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Ready
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Extracting
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-800">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">
      <FileText className="h-3 w-3" aria-hidden="true" />
      Uploaded
    </span>
  );
}
