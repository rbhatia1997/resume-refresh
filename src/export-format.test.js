import test from "node:test";
import assert from "node:assert/strict";
import { splitJobDate } from "./export-format.js";

test("splitJobDate supports role company location with trailing year range", () => {
  assert.deepEqual(
    splitJobDate("IT Support Specialist - Example Retail, Northern California 2022 - Present"),
    {
      role: "IT Support Specialist - Example Retail, Northern California",
      date: "2022 - Present"
    }
  );
});
