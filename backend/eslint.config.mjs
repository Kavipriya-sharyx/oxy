// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "eslint.config.mjs"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierRecommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      sourceType: "commonjs",
    },
    rules: {
      // The boilerplate uses `any` and loose typing widely; warn instead of failing.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-duplicate-enum-values": "warn",
      "@typescript-eslint/no-wrapper-object-types": "warn",
      "no-empty": "warn",
      "no-useless-escape": "warn",
      "no-var": "warn",
      "prefer-const": "warn",
      "prettier/prettier": "warn",
    },
  },
);
