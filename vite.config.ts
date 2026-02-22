import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import svgr from "vite-plugin-svgr";
import glsl from "vite-plugin-glsl";

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      projects: ["./tsconfig.paths.json"]
    }),
    svgr({
      svgrOptions: {
        exportType: 'default'
      }
    }),
    glsl()
  ],
  resolve: {
    alias: {}
  },
  server: {
    allowedHosts: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-mui": ["@mui/material", "@emotion/styled"],
          "vendor-monaco": ["@monaco-editor/react"],
          "vendor-yjs": ["yjs", "y-monaco"],
          "vendor-webrtc": ["y-webrtc"],
          "vendor-lua": ["fengari"],
          "vendor-tone": ["tone"],
        }
      }
    }
  }
});

