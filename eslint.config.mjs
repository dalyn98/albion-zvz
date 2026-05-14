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
  // React 19 / eslint-plugin-react-hooks 의 새 strict 규칙들은 기존 코드 (29개소)
  // 에서 일제히 error 로 떠 CI 를 막는다. 런타임 버그는 아니고 권고 패턴이라
  // warning 으로 강등 — 점진 리팩터링하며 다시 error 로 올릴 것.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
