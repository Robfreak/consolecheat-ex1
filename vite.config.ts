import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function fontsourceWoff2() {
  return {
    name: "fontsource-woff2",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!id.includes("/@fontsource/") || !id.endsWith(".css")) return null;
      return code.replace(/,\s*url\([^)]+\.woff\)\s*format\((['"])woff\1\)/g, "");
    },
  };
}

// Project site: https://robfreak.github.io/consolecheat-ex1/
export default defineConfig({
  base: "/consolecheat-ex1/",
  plugins: [fontsourceWoff2(), react(), tailwindcss()],
  server: { host: "0.0.0.0" },
  preview: { host: "0.0.0.0", port: 4173 },
});
