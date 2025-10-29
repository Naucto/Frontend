import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import svgr from "vite-plugin-svgr";
import glsl from "vite-plugin-glsl";

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
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
  }
});
