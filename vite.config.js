import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "extension/p2/vision/vision.js",
      formats: ["iife"],
      name: "P2Vision",
      fileName: () => "p2-vision.js"
    },
    outDir: "extension/dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});