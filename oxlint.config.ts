import { defineConfig } from "oxlint";
import effectRulesConfig from "@timmo001/oxlint-rules/configs/recommended-effect";

export default defineConfig({
  extends: [effectRulesConfig],
  overrides: [
    {
      files: ["src/background.ts", "src/popup.ts"],
      rules: {
        "anti-slop/no-runtime-typeof": "off",
        "anti-slop/no-unknown-parameters": "off",
      },
    },
  ],
});
