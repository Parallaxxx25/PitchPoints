import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const DEVSERVER = "http://127.0.0.1:8000";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/matches": DEVSERVER,
      "/profiles": DEVSERVER,
      "/live": { target: DEVSERVER, ws: true },
    },
  },
});
