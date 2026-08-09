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
  ]),
  {
    rules: {
      // Legitimate hydration / localStorage sync patterns trip this rule.
      "react-hooks/set-state-in-effect": "off",
      // Date.now()/Math.random() in client dashboards are intentional.
      "react-hooks/purity": "off",
    },
  },
]);

export default eslintConfig;
