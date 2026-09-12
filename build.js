// build.js
// Bundles content.js (this repo's src/ pipeline + the extension's
// content.js) into a single browser-ready file, and copies models/ over —
// run this any time src/ changes, then reload the unpacked extension.
//
// Why bundling is required at all: Chrome extensions cannot resolve bare
// npm import specifiers ("tesseract.js", "@tensorflow/tfjs", etc.) at
// runtime the way Node does — there's no node_modules lookup in a browser.
// esbuild resolves and inlines all of that into one plain script.
//
// fs / url / canvas are marked external on purpose: those are only ever
// reached by the Node-only branches in redact.js / ocr.js / faceDetection.js
// (guarded by `isExtension`), which never execute inside the real browser
// bundle. Leaving them external avoids esbuild trying (and failing) to
// resolve Node built-ins for a browser target.
//
// Usage: node build.js /path/to/extension
//   (defaults to ../extension if omitted, adjust to your actual layout)

import { build } from "esbuild";
import { mkdirSync, cpSync, existsSync } from "fs";
import path from "path";

const extensionDir = process.argv[2] || "../extension";

if (!existsSync(extensionDir)) {
  console.error(`Extension folder not found: ${extensionDir}`);
  console.error("Usage: node build.js /path/to/extension");
  process.exit(1);
}

const contentEntry = path.join(extensionDir, "content.js");
if (!existsSync(contentEntry)) {
  console.error(`Expected ${contentEntry} — copy P1's content.js there first`);
  process.exit(1);
}

// src/ needs to physically sit inside the extension folder so
// content.js's "./src/index.js" import resolves during the bundle.
mkdirSync(path.join(extensionDir, "src"), { recursive: true });
cpSync("src", path.join(extensionDir, "src"), { recursive: true });

// Model files ship as plain static assets, fetched at runtime via
// chrome.runtime.getURL() — not bundled into the JS at all.
mkdirSync(path.join(extensionDir, "models"), { recursive: true });
cpSync("models", path.join(extensionDir, "models"), { recursive: true });

await build({
  entryPoints: [contentEntry],
  bundle: true,
  format: "iife",
  platform: "browser",
  external: ["fs", "url", "canvas"],
  // content.js lives inside the extension folder, outside this project's
  // own node_modules — without this, esbuild's normal node_modules walk
  // (up from the entry file's own directory) never finds tesseract.js/tfjs.
  nodePaths: [path.resolve("node_modules")],
  outfile: path.join(extensionDir, "content.bundle.js"),
});

console.log("Built content.bundle.js, copied src/ and models/ into", extensionDir);
console.log("Reload the unpacked extension in chrome://extensions to pick up changes.");
