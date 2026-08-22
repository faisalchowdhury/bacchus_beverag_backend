import { createSettingsPageRoutes } from "../settingsPage.factory";
import { PrivacyModel } from "./Privacy.model";

export const PrivacyRoutes = createSettingsPageRoutes(PrivacyModel, "Privacy");
