import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
    // tsconfig sets jsx: "preserve" for Next.js; tests compile JSX themselves.
    esbuild: { jsx: "automatic" },
    resolve: {
        alias: { "@": path.resolve(__dirname) },
    },
    test: {
        environment: "node",
        include: ["**/*.test.ts"],
        exclude: ["node_modules", ".next"],
    },
});
