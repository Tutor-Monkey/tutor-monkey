import "server-only";

import { LlamaCloud, toFile } from "@llamaindex/llama-cloud";

export class LlamaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlamaParseError";
  }
}

export type LlamaParseResult = {
  text: string;
  charCount: number;
  wordCount: number;
  provider: "llamaparse";
};

const LLAMA_PARSE_TIMEOUT_SECONDS = 600;

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function responseText(result: Awaited<ReturnType<LlamaCloud["parsing"]["parse"]>>): string {
  if (typeof result.markdown_full === "string") return result.markdown_full.trim();
  if (typeof result.text_full === "string") return result.text_full.trim();

  const markdownPages = result.markdown?.pages ?? [];
  const textPages = result.text?.pages ?? [];
  const pages = markdownPages.length > 0 ? markdownPages : textPages;
  return pages
    .map((page) => {
      if ("markdown" in page && typeof page.markdown === "string") return page.markdown;
      if ("text" in page && typeof page.text === "string") return page.text;
      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export async function parseWithLlamaParse(
  filename: string,
  data: Uint8Array,
  mimeType?: string | null,
): Promise<LlamaParseResult> {
  const apiKey = process.env.LLAMA_API_KEY;
  if (!apiKey) throw new Error("LLAMA_API_KEY is not configured on the server.");

  const client = new LlamaCloud({
    apiKey,
    timeout: 60_000,
    maxRetries: 2,
  });
  const upload = await toFile(data, filename, { type: mimeType ?? "application/octet-stream" });
  try {
    const result = await client.parsing.parse(
      {
        tier: "agentic",
        version: "latest",
        upload_file: upload,
        expand: ["markdown"],
      },
      {
        timeout: LLAMA_PARSE_TIMEOUT_SECONDS,
        pollingInterval: 2,
        maxInterval: 10,
      },
    );

    const text = responseText(result);
    if (!text) {
      throw new LlamaParseError("LlamaParse completed without returning readable text.");
    }

    return {
      text,
      charCount: Array.from(text).length,
      wordCount: wordCount(text),
      provider: "llamaparse",
    };
  } catch (error) {
    if (error instanceof LlamaParseError) throw error;
    const detail = error instanceof Error ? error.message : "unknown provider error";
    throw new LlamaParseError(`LlamaParse couldn't process this document: ${detail}`);
  }
}
