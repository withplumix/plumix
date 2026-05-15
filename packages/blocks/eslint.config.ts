import { defineConfig } from "eslint/config";

import { baseConfig, noBareThrowError } from "@plumix/eslint-config/base";
import { reactConfig } from "@plumix/eslint-config/react";

export default defineConfig(baseConfig, reactConfig, noBareThrowError);
