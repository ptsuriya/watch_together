import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    // Components copied from React Bits are kept close to upstream so they can be refreshed from it. They read the
    // clock and refs inside event-time closures, which the compiler rules cannot tell apart from render-time use.
    files: ["app/components/bits/**", "app/components/peek-rating.tsx"],
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
