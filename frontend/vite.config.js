import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: {
    host: "0.0.0.0",
    allowedHosts: ["protective-spirit-production-c76a.up.railway.app"],
  },
  server: {
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
});
