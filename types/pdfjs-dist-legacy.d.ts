/**
 * Type declarations for pdfjs-dist's Node.js-recommended legacy build.
 *
 * The package ships TypeScript declarations only for its root entry
 * ("pdfjs-dist"); the legacy subpath ("pdfjs-dist/legacy/build/pdf.mjs")
 * that Mozilla recommends for Node.js environments has no declaration file.
 * This ambient module maps the legacy subpath onto the root types so the
 * extractor in lib/teachers/extract.ts stays fully typed.
 */
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export { getDocument } from "pdfjs-dist";
  export type {
    PDFDocumentLoadingTask,
    PDFDocumentProxy,
    PDFPageProxy,
  } from "pdfjs-dist";
}
