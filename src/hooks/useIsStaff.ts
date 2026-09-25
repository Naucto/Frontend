import { useUser } from "@providers/UserProvider";

export function useIsStaff(): boolean {
  const { user } = useUser();
  return user?.roles?.some((role) =>
    role.permissions?.includes("MODERATE_CONTENT")
  ) ?? false;
}
