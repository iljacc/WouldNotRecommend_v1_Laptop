import { fileURLToPath } from "node:url";
import { transformWithOxc } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: false,
  plugins: [
    {
      name: "test-typescript-transform",
      enforce: "pre",
      async transform(code, id) {
        if (!/\.tsx?$/.test(id)) return null;
        return transformWithOxc(code, id, {
          jsx: {
            runtime: "automatic",
          },
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
