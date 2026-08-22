import { createSettingsPageRoutes } from "../settingsPage.factory";
import { TermsModel } from "./Terms.model";

export const TermsRoutes = createSettingsPageRoutes(TermsModel, "Terms");
