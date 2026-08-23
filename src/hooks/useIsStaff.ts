import { useUser } from "@providers/UserProvider";

const STAFF_ROLES = ["Admin", "Moderator"];

/**
 * Whether the signed-in user holds a staff role.
 *
 * This gates staff-only UI, not access: the backend re-checks the same roles on
 * every `/projects/:id/preview*` call, so a forged `true` here buys nothing.
 */
export function useIsStaff(): boolean {
  const { user } = useUser();

  return user?.roles?.some((role) => STAFF_ROLES.includes(role.name)) ?? false;
}
