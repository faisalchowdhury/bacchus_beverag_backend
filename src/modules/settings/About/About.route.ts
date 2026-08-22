import { createSettingsPageRoutes } from "../settingsPage.factory";
import { AboutModel } from "./About.model";

export const AboutRoutes = createSettingsPageRoutes(AboutModel, "About");
