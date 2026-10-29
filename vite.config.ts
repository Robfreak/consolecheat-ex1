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

// Custom domain: https://title-id-finder.consolecheat.com/
export default defineConfig({
  base: "/",
  plugins: [fontsourceWoff2(), react(), tailwindcss()],
  server: { host: "0.0.0.0" },
  preview: { host: "0.0.0.0", port: 4173 },
});
