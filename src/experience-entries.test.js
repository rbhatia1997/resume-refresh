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
