import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "url";
import path from "path";

// FlatCompat lets ESLint 9 flat-config consume legacy eslintrc-style
// configs (which is what eslint-config-next still ships as of Next 16).
// Attempting to spread them directly as flat-config arrays caused the
// build to fail with "Each share config is an object" errors.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Admin client files are auto-generated / heavily imperative — relax
    // a few rules that fire constantly there without real benefit.
    files: ["src/components/admin/**/*.tsx", "src/app/api/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
