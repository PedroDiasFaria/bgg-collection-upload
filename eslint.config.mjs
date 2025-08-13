import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginPrettier from "eslint-plugin-prettier";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.eslint.json",
        sourceType: "module",
      },
    },
    plugins: {
      prettier: eslintPluginPrettier,
    },
    rules: {
      "no-unused-vars": "error",
      "no-undef": "off",
      "prefer-const": "error",
      "no-console": "off",
      "no-debugger": "warn",
      "prettier/prettier": [
        "error",
        {
          singleQuote: true,
          semi: false,
          trailingComma: "all",
          printWidth: 100,
          tabWidth: 2,
        },
      ],
    },
  },
  prettier,
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
];
