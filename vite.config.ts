/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  root: resolve(__dirname),
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome128",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  clearScreen: false,
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-electron/**",
      "**/.claude/**",
      "**/tests/e2e/**",
    ],
    coverage: {
      provider: "v8",
      include: ["src/model/**/*.ts"],
      exclude: ["src/model/**/*.d.ts", "src/model/types.ts"],
      // BUILD_PLAN §13 exit criterion: ≥ 80% on src/model/
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
