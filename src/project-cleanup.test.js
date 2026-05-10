import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("package no longer exposes legacy v2 prototype build scripts or dependencies", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.equal(pkg.scripts["build:v2"], undefined);
  assert.equal(pkg.scripts["build:v2:js"], undefined);
  assert.equal(pkg.scripts["build:v2:css"], undefined);

  for (const dependency of ["@tailwindcss/cli", "esbuild", "react", "react-dom", "tailwindcss"]) {
    assert.equal(pkg.dependencies[dependency], undefined);
  }
});

test("web manifest opens the current root app", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/site.webmanifest", import.meta.url), "utf8"));

  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.background_color, "#f8f9fa");
  assert.equal(manifest.theme_color, "#2563eb");
});
