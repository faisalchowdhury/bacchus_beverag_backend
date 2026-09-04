/**
 * Application roles.
 *
 * Add a new role here and it becomes available to `guardRole([...])` and the
 * user schema enum.
 *
 * `staff` are the venue's own team. They are created by an admin (never by
 * self-registration), sign in to the dashboard to read quotes, and are the
 * people copied on new-quote and quote-accepted notifications. They cannot
 * manage accounts or change site settings — that stays with `admin`.
 */
export type TRole = "admin" | "staff" | "user";

export const ERole: TRole[] = ["admin", "staff", "user"];

/** Every role — handy shorthand for routes any signed-in account may hit. */
export const ALL_ROLES: TRole[] = ERole;

/** Roles that may open the dashboard and read the quote pipeline. */
export const DASHBOARD_ROLES: TRole[] = ["admin", "staff"];
