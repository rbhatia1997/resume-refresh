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

test("parseExperienceEntries treats seasonal dates as editable date ranges", () => {
  const entries = parseExperienceEntries([
    "Software Engineering Intern - Example Co, Remote",
    "Summer 2022",
    "- Built internal tooling for support workflows",
    "Research Assistant - Example Lab | Fall 2021 - Spring 2022",
    "- Coordinated participant scheduling and data cleanup"
  ]);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].title, "Software Engineering Intern");
  assert.equal(entries[0].company, "Example Co");
  assert.equal(entries[0].location, "Remote");
  assert.equal(entries[0].dateRange, "Summer 2022");
  assert.equal(entries[0].confidence, "high");
  assert.equal(entries[1].title, "Research Assistant");
  assert.equal(entries[1].company, "Example Lab");
  assert.equal(entries[1].dateRange, "Fall 2021 - Spring 2022");
  assert.equal(
    formatExperienceEntryHeading(entries[1]),
    "Research Assistant - Example Lab Fall 2021 - Spring 2022"
  );
});

test("parseExperienceEntries strips duplicate inline dates from role headings", () => {
  const entries = parseExperienceEntries([
    "Co-Founder - LYOKO LLC (lyoko.com) Jun 2022 - Aug 2022 Jan 2022 - Present",
    "- Created $7K+ annual revenue through subscriptions and commissions with 14x growth rate YoY."
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "Co-Founder");
  assert.equal(entries[0].company, "LYOKO LLC (lyoko.com)");
  assert.equal(entries[0].dateRange, "Jan 2022 - Present");
  assert.equal(
    formatExperienceEntryHeading(entries[0]),
    "Co-Founder - LYOKO LLC (lyoko.com) Jan 2022 - Present"
  );
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
