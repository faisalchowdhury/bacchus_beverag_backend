/**
 * Application roles.
 *
 * Add a new role here and it becomes available to `guardRole([...])` and the
 * user schema enum.
 */
export type TRole = "admin" | "user";

export const ERole: TRole[] = ["admin", "user"];

/** Every role — handy shorthand for routes any signed-in account may hit. */
export const ALL_ROLES: TRole[] = ERole;
