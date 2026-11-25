import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    pls: "src/main.ts",
  },
  format: "esm",
  platform: "node",
  // Ship a self-contained CLI: the Effect packages are inlined so installs never
  // resolve them. Their loose internal ranges (e.g. platform-node -> ^platform-node-shared)
  // otherwise pull versions incompatible with our pinned `effect`.
  deps: {
    onlyBundle: [
      "effect",
      "@effect/platform-node",
      "@effect/platform-node-shared",
    ],
  },
});
