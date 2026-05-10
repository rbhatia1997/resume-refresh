import test from "node:test";
import assert from "node:assert/strict";
import { parseExperienceEntries, formatExperienceEntryHeading } from "./experience-entries.js";

test("parseExperienceEntries splits title company location and date range", () => {
  const entries = parseExperienceEntries([
    "IT Support Specialist - Safeway, Northern California | 2022 - Present",
    "- Diagnose and resolve hardware and software issues",
    "- Install and maintain POS systems"
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "IT Support Specialist");
  assert.equal(entries[0].company, "Safeway");
  assert.equal(entries[0].location, "Northern California");
  assert.equal(entries[0].dateRange, "2022 - Present");
  assert.deepEqual(entries[0].bullets, [
    "Diagnose and resolve hardware and software issues",
    "Install and maintain POS systems"
  ]);
});

test("formatExperienceEntryHeading emits role/company/location separate from date", () => {
  assert.equal(
    formatExperienceEntryHeading({
      title: "IT Support Specialist",
      company: "Safeway",
      location: "Northern California",
      dateRange: "2022 - Present"
    }),
    "IT Support Specialist - Safeway, Northern California 2022 - Present"
  );
});

test("parseExperienceEntries recovers OCR-style roles and wrapped unbulleted bullets", () => {
  const entries = parseExperienceEntries([
    "Service & Delivery Technician -",
    "Safeway, Northern California",
    "July 2025 - Present",
    "Troubleshoot and resolve hardware",
    "and software issues for retail store",
    "systems and devices",
    "Support installation, replacement,",
    "and configuration of IT equipment",
    "Sushi Chef - Mikuni, Davis",
    "September 2021 - June 2025",
    "Delivered customer service in fast-",
    "paced restaurant environment",
    "Managed order accuracy and",
    "multitasking under pressure"
  ]);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].title, "Service & Delivery Technician");
  assert.equal(entries[0].company, "Safeway");
  assert.equal(entries[0].location, "Northern California");
  assert.equal(entries[0].dateRange, "July 2025 - Present");
  assert.deepEqual(entries[0].bullets, [
    "Troubleshoot and resolve hardware and software issues for retail store systems and devices",
    "Support installation, replacement, and configuration of IT equipment"
  ]);
  assert.equal(entries[1].title, "Sushi Chef");
  assert.equal(entries[1].company, "Mikuni");
  assert.equal(entries[1].dateRange, "September 2021 - June 2025");
  assert.deepEqual(entries[1].bullets, [
    "Delivered customer service in fast-paced restaurant environment",
    "Managed order accuracy and multitasking under pressure"
  ]);
});

test("formatExperienceEntryHeading can pad dates for monospace editor previews", () => {
  const heading = formatExperienceEntryHeading({
    title: "Sushi Chef",
    company: "Mikuni",
    location: "Davis",
    dateRange: "September 2021 - June 2025"
  }, { alignDate: true, width: 68 });

  assert.match(heading, /^Sushi Chef - Mikuni, Davis\s+September 2021 - June 2025$/);
  assert.equal(heading.length, 68);
});
