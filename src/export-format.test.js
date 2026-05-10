import test from "node:test";
import assert from "node:assert/strict";
import { splitJobDate } from "./export-format.js";

test("splitJobDate supports role company location with trailing year range", () => {
  assert.deepEqual(
    splitJobDate("IT Support Specialist - Safeway, Northern California 2022 - Present"),
    {
      role: "IT Support Specialist - Safeway, Northern California",
      date: "2022 - Present"
    }
  );
});

test("splitJobDate removes earlier date ranges from the role", () => {
  assert.deepEqual(
    splitJobDate("Co-Founder - LYOKO LLC (lyoko.com) Jun 2022 - Aug 2022 Jan 2022 - Present"),
    {
      role: "Co-Founder - LYOKO LLC (lyoko.com)",
      date: "Jan 2022 - Present"
    }
  );
});

test("splitJobDate supports seasonal single-date roles", () => {
  assert.deepEqual(
    splitJobDate("Product Manager - Super (formerly Snapcommerce) Summer 2022"),
    {
      role: "Product Manager - Super (formerly Snapcommerce)",
      date: "Summer 2022"
    }
  );
});
