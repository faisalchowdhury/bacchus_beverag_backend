import { renderSettingsPageHtml } from "../settingsPage.factory";
import { PrivacyModel } from "./Privacy.model";

/**
 * Public HTML privacy policy — Apple / Google require a reachable URL when
 * publishing an app. Mounted at /api/v1/privacy-policy-page.
 */
export const htmlRoute = renderSettingsPageHtml(PrivacyModel, "Privacy Policy");
