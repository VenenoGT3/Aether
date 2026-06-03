import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // k6 load-test scripts run on the k6 (goja) runtime, not Node — they use
    // k6 globals (__ENV/__VU/__ITER) and k6/* module imports, so the app's
    // ESLint rules don't apply.
    "tests/load/**",
  ]),
]);

export default eslintConfig;
