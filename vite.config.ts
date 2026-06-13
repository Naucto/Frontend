import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import svgr from "vite-plugin-svgr";
import glsl from "vite-plugin-glsl";

// Strip dev-only console.log/info/debug from our production bundles (Oxc's minifier only does
// all-or-nothing `drop_console`; we keep warn/error). Scoped to project source. See AGENTS.md.
function stripDevConsole(): Plugin {
  const CONSOLE_CALL = /console\s*\.\s*(?:log|info|debug)\s*\((?:[^()]|\([^()]*\))*\)\s*;?/g;
  return {
    name: "strip-dev-console",
    apply: "build",
    transform(code, id) {
      if (!/\.[jt]sx?$/.test(id) || id.includes("node_modules")) return null;
      const out = code.replace(CONSOLE_CALL, "");
      return out === code ? null : { code: out, map: null };
    }
  };
}

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
    glsl(),
    stripDevConsole()
  ],
  resolve: {
    alias: {}
  },
  server: {
    host: true,
    allowedHosts: true
  },
  build: {
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: "vendor-react", test: /node_modules[\\/](?:react|react-dom|react-router-dom)[\\/]/ },
            { name: "vendor-mui", test: /node_modules[\\/](?:@mui[\\/]material|@emotion[\\/]styled)[\\/]/ },
            { name: "vendor-monaco", test: /node_modules[\\/]@monaco-editor[\\/]react[\\/]/ },
            { name: "vendor-yjs", test: /node_modules[\\/](?:yjs|y-monaco)[\\/]/ },
            { name: "vendor-webrtc", test: /node_modules[\\/]y-webrtc[\\/]/ },
            { name: "vendor-lua", test: /node_modules[\\/]fengari[\\/]/ },
            { name: "vendor-tone", test: /node_modules[\\/]tone[\\/]/ },
          ]
        }
      }
    }
  }
});

