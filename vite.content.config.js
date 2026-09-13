import { defineConfig } from "vite";

// Separate from vite.config.js (which only builds the YOLO vision
// pipeline into extension/dist/p2-vision.js). This config builds
// content.js — and everything it imports, including src/index.js,
// src/redact.js, src/checks/* — into extension/content.bundle.js,
// which is the file manifest.json actually loads as a content script.
// Previously nothing built this file at all; it was a stale, manually
// committed artifact.
export default defineConfig({
  build: {
    lib: {
      entry: "extension/content.js",
      formats: ["iife"],
      name: "ObscuraContent",
      fileName: () => "content.bundle.js",
    },
    outDir: "extension",
    emptyOutDir: false,
    rollupOptions: {
      // redact.js / faceDetection.js have Node-only branches (guarded by
      // `isExtension` at runtime, used only for `npm test` / local scripts,
      // never reached in the browser) that import these. The bundler still
      // tries to resolve them statically, so they must be externalized.
      external: ["canvas", "fs", "url"],
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
