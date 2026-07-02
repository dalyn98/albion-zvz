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
    ".vercel/**",
    // Agent tooling — Node CommonJS hook scripts, not app code.
    ".claude/**",
    // Local one-off exports/reports are not application source.
    "outputs/**",
  ]),
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      // AGENTS.md hard rule #2: force-static 금지.
      // 빌드타임에 layout 의 x-pathname 헤더가 비어 AppGate 가 HTML 에 박혀버린다.
      // 새 라우트는 force-dynamic 또는 ISR (revalidate=...) 만 허용.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name='dynamic'] > Literal[value='force-static']",
          message:
            "AGENTS.md hard rule: `export const dynamic = 'force-static'` 금지. force-dynamic 또는 revalidate 를 사용하세요.",
        },
      ],
    },
  },
]);

export default eslintConfig;
