import { userControllerGetProfile } from "@api";
import { useUser } from "@providers/UserProvider";
import { LocalStorageManager } from "@utils/LocalStorageManager";

import { useCallback } from "react";

interface UseAuthSuccessReturn {
  handleAuthSuccess: (accessToken: string, onClose?: () => void) => Promise<void>;
}

export const useAuthSuccess = (): UseAuthSuccessReturn => {
  const { setUser } = useUser();

  const handleAuthSuccess = useCallback(async (accessToken: string, onClose?: () => void) => {
    LocalStorageManager.setToken(accessToken);

    const { data: userRes, error } = await userControllerGetProfile();
    if (error || !userRes) {
      LocalStorageManager.setToken();
      throw new Error((error as { message?: string })?.message ?? "Failed to fetch user profile");
    }

    LocalStorageManager.setUser({
      id: String(userRes.id),
      email: userRes.email,
      name: userRes.username,
    });
    setUser(userRes);

    if (onClose) onClose();
  }, [setUser]);

  return { handleAuthSuccess };
};
