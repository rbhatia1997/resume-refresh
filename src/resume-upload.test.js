import test from "node:test";
import assert from "node:assert/strict";
import { classifyResumeUpload } from "./resume-upload.js";

test("classifyResumeUpload accepts supported image resume photos", () => {
  assert.equal(classifyResumeUpload({ fileName: "resume.jpg", mimeType: "image/jpeg" }).kind, "image");
  assert.equal(classifyResumeUpload({ fileName: "resume.png", mimeType: "image/png" }).kind, "image");
  assert.equal(classifyResumeUpload({ fileName: "resume.webp", mimeType: "image/webp" }).kind, "image");
});

test("classifyResumeUpload rejects unsupported uploads", () => {
  assert.throws(
    () => classifyResumeUpload({ fileName: "resume.heic", mimeType: "image/heic" }),
    /Unsupported file type/
  );
});
