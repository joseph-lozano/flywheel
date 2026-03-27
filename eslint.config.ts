import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import solid from "eslint-plugin-solid/configs/recommended";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "out/",
      "dist/",
      "node_modules/",
      "build/",
      "scripts/",
      "src/browser/",
      "src/terminal/",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.config.ts"],
        },
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    ...solid,
  },
  {
    files: ["*.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
