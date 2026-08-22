import { UserRoutes } from "../modules/user/user.route";
import { AdminRoutes } from "../modules/admin/admin.route";
import { NotificationRoutes } from "../modules/notifications/notification.route";
import { QuoteRoutes } from "../modules/quote/quote.route";
import { TermsRoutes } from "../modules/settings/Terms/Terms.route";
import { AboutRoutes } from "../modules/settings/About/About.route";
import { PrivacyRoutes } from "../modules/settings/privacy/Privacy.route";
import { htmlRoute } from "../modules/settings/privacy/Privacy.controller";

/**
 * Every entry is mounted under /api/v1/<path>.
 * Add new feature modules here.
 */
export const routesConfig = [
  { path: "auth", handler: UserRoutes },
  { path: "admin", handler: AdminRoutes },
  { path: "notification", handler: NotificationRoutes },
  { path: "quote", handler: QuoteRoutes },

  { path: "terms", handler: TermsRoutes },
  { path: "about", handler: AboutRoutes },
  { path: "privacy", handler: PrivacyRoutes },

  // Public HTML page — app stores require a reachable privacy policy URL.
  { path: "privacy-policy-page", handler: htmlRoute },
];
