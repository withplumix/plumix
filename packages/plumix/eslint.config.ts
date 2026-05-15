import { defineConfig } from "eslint/config";

import { baseConfig, noBareThrowError } from "@plumix/eslint-config/base";

export default defineConfig(baseConfig, noBareThrowError);
