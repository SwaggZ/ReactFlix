import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // API endpoints (only these get proxied)
      "/series": "http://127.0.0.1:80",
      "/series_data": "http://127.0.0.1:80",
      "/movies": "http://127.0.0.1:80",
      "/movies/count": "http://127.0.0.1:80",
      "/genres": "http://127.0.0.1:80",
      "/add_movie": "http://127.0.0.1:80",
      "/add_series": "http://127.0.0.1:80",

      // If you fetch updates from backend:
      "/updates.txt": { target: "http://127.0.0.1:80", changeOrigin: true },
      "/api": { target: "http://127.0.0.1:80", changeOrigin: true },

      // OPTIONAL: if you decide to serve videos/images via a prefixed route:
      // In React, use /media/<path> and this will proxy to Flask /<path>
      "/media": {
        target: "http://127.0.0.1:80",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/media/, ""),
      },
    },
  },
});
