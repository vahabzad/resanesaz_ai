import path from "node:path";
import { profileRoot } from "../browser-runtime";
// Only local asset paths remain; application configuration is owned by this backend.
export const appConfigs = {
  CRAWLER: { browserUserDataDir: profileRoot(), browserExecutablePath: process.env.SOCIAL_BROWSER_EXECUTABLE ?? "" },
  UPLOAD_PATH: path.resolve(".data/social-assets"),
};
