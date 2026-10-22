import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Project site: https://robfreak.github.io/consolecheat-ex1/
export default defineConfig({
  base: "/consolecheat-ex1/",
  plugins: [react(), tailwindcss()],
  server: { host: "0.0.0.0" },
  preview: { host: "0.0.0.0", port: 4173 },
});
