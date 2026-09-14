import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "p4Listener.js",
      formats: ["iife"],
      name: "P4Listener",
      fileName: () => "p4-listener.js"
    },
    outDir: "extension/dist",
    emptyOutDir: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});