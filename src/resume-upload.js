import path from "node:path";

const SUPPORTED_UPLOADS = new Map([
  [".pdf", { kind: "pdf", mimes: new Set(["application/pdf", ""]) }],
  [".txt", { kind: "text", mimes: new Set(["text/plain", ""]) }],
  [".md", { kind: "text", mimes: new Set(["text/markdown", "text/x-markdown", "text/plain", ""]) }],
  [".jpg", { kind: "image", mimes: new Set(["image/jpeg", ""]) }],
  [".jpeg", { kind: "image", mimes: new Set(["image/jpeg", ""]) }],
  [".png", { kind: "image", mimes: new Set(["image/png", ""]) }],
  [".webp", { kind: "image", mimes: new Set(["image/webp", ""]) }]
]);

const EXTENSION_TO_MIME = new Map([
  [".pdf", "application/pdf"],
  [".txt", "text/plain"],
  [".md", "text/markdown"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

export function inferMimeFromFileName(fileName = "") {
  return EXTENSION_TO_MIME.get(path.extname(fileName).toLowerCase()) || "";
}

export function classifyResumeUpload({ fileName = "", mimeType = "" } = {}) {
  const extension = path.extname(fileName).toLowerCase();
  const config = SUPPORTED_UPLOADS.get(extension);

  if (!config) {
    throw new Error("Unsupported file type. Use PDF, TXT, MD, JPG, PNG, or WEBP.");
  }

  const normalizedMime = String(mimeType || "").split(";")[0].trim().toLowerCase();
  if (normalizedMime && !config.mimes.has(normalizedMime)) {
    throw new Error("Unsupported file type. Use PDF, TXT, MD, JPG, PNG, or WEBP.");
  }

  return {
    kind: config.kind,
    extension,
    mimeType: normalizedMime || inferMimeFromFileName(fileName)
  };
}
