import { defineConfig } from "vitest/config";
import react from "@vitejs-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    coverage: {
      enabled: true,
      provider: "v8",
    },
  },
});