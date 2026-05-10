import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { handleRequest, parseResumeForExport } from "./app.js";

function exportRequest(body, address = "203.0.113.10") {
  return new Request("http://127.0.0.1:3216/api/export", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": address
    },
    body: JSON.stringify(body)
  });
}

const conciseResume = `
Jane Doe
jane@example.com | (415) 555-1212

SUMMARY
IT support specialist with retail systems experience.

EXPERIENCE
IT Support Specialist - Example Retail, California 2022 - Present
- Resolved POS and device issues across store systems.
- Supported device deployment and hardware troubleshooting.

SKILLS
Hardware Troubleshooting
POS Systems
Device Deployment

EDUCATION
Example High School
2022
`;

const previewStyledResume = `
ALEX RIVERA
Austin, TX | alex@example.com | linkedin.com/in/alexrivera | 555-010-2200

SUMMARY
Product manager with 5+ years of experience delivering AI infrastructure systems.

EXPERIENCE
Product Manager - Example Hardware Co Aug 2023 - Present
- Enable $100M+ in sales through direct customer engagement.

SKILLS
Product Strategy | AI Infrastructure | Stakeholder Management

EDUCATION
Example University
`;

async function readDocxDocumentXml(response) {
  assert.equal(response.status, 200);
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  return zip.file("word/document.xml").async("string");
}

function longResume() {
  const bullets = Array.from({ length: 95 }, (_, index) => (
    `- Supported store technology issue ${index + 1} across multiple systems, locations, devices, and operational workflows.`
  )).join("\n");

  return `
Jane Doe
jane@example.com | (415) 555-1212

SUMMARY
IT support specialist with retail systems experience.

EXPERIENCE
IT Support Specialist - Example Retail, California 2022 - Present
${bullets}
`;
}

test("PDF export produces a single-page PDF for a concise resume", async () => {
  const response = await handleRequest(exportRequest({
    format: "pdf",
    candidateName: "Jane Doe",
    text: conciseResume
  }), { serveStatic: false });

  assert.equal(response.status, 200);
  const pdf = await PDFDocument.load(await response.arrayBuffer());
  assert.equal(pdf.getPageCount(), 1);
});

test("export formatting compacts skills into grouped rows", () => {
  const sections = parseResumeForExport(conciseResume);

  assert.deepEqual(sections.skills, [
    "Hardware Troubleshooting | POS Systems | Device Deployment"
  ]);
});

test("DOCX export matches the final preview hierarchy", async () => {
  const response = await handleRequest(exportRequest({
    format: "docx",
    candidateName: "Alex Rivera",
    text: previewStyledResume
  }, "203.0.113.13"), { serveStatic: false });

  const xml = await readDocxDocumentXml(response);
  assert.match(xml, /<w:jc w:val="center"\/>/);
  assert.match(xml, /<w:pBdr><w:bottom w:val="single"/);
  assert.match(xml, /<w:b\/>.*?<w:sz w:val="21"\/>.*?<w:t[^>]*>Product Manager - Example Hardware Co<\/w:t>/);
  assert.match(xml, /<w:tabs><w:tab w:val="right"/);
});

test("PDF and DOCX export reject resumes that exceed the one-page budget", async () => {
  const pdfResponse = await handleRequest(exportRequest({
    format: "pdf",
    candidateName: "Jane Doe",
    text: longResume()
  }, "203.0.113.11"), { serveStatic: false });
  const docxResponse = await handleRequest(exportRequest({
    format: "docx",
    candidateName: "Jane Doe",
    text: longResume()
  }, "203.0.113.12"), { serveStatic: false });

  assert.equal(pdfResponse.status, 400);
  assert.match((await pdfResponse.json()).error, /one-page/i);
  assert.equal(docxResponse.status, 400);
  assert.match((await docxResponse.json()).error, /one-page/i);
});
