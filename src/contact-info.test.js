import test from "node:test";
import assert from "node:assert/strict";
import { extractContactInfo, buildContactSuggestions } from "./contact-info.js";

test("extractContactInfo detects name email phone location and URL from header lines", () => {
  const contact = extractContactInfo([
    "Jane Doe",
    "San Francisco, CA | jane@example.com | (415) 555-1212 | linkedin.com/in/janedoe"
  ]);

  assert.equal(contact.name, "Jane Doe");
  assert.equal(contact.email, "jane@example.com");
  assert.equal(contact.phone, "(415) 555-1212");
  assert.equal(contact.location, "San Francisco, CA");
  assert.equal(contact.links[0], "linkedin.com/in/janedoe");
});

test("buildContactSuggestions suggests missing required contact fields without blocking", () => {
  const suggestions = buildContactSuggestions({
    name: "Jane Doe",
    email: "",
    phone: "",
    location: "Oakland, CA",
    links: []
  });

  assert.deepEqual(suggestions.map((item) => item.id), ["contact-email-missing", "contact-phone-missing"]);
  assert.ok(suggestions.every((item) => item.applyMode === "insert-field"));
  assert.ok(suggestions.every((item) => item.severity !== "blocking"));
});
