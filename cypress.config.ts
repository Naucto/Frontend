import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: process.env.FRONTEND_URL || "http://localhost:3001",
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
});
