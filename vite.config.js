import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // SPA : toutes les routes renvoient index.html (utile aussi en preview)
  preview: { port: 4173 },
});
