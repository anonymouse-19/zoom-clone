// ESLint configuration (flat config format, required since Next.js 16 removed `next lint`).
// ESLint finds likely bugs; Prettier (configured in .prettierrc.json) owns formatting.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  // Next.js rules: React hooks, accessibility basics, and Core Web Vitals pitfalls.
  ...nextVitals,
  // TypeScript-specific rules, e.g. warn on `any`.
  ...nextTs,
  // Must come last: switches off every ESLint rule that would fight Prettier's formatting.
  prettierConfig,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
