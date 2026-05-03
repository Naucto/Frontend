import { useCallback } from "react";
import { userControllerGetProfile } from "@api";
import { useUser } from "@providers/UserProvider";
import { LocalStorageManager } from "@utils/LocalStorageManager";

interface UseAuthSuccessReturn {
  handleAuthSuccess: (accessToken: string, onClose?: () => void) => Promise<void>;
}

export const useAuthSuccess = (): UseAuthSuccessReturn => {
  const { setUser } = useUser();

  const handleAuthSuccess = useCallback(async (accessToken: string, onClose?: () => void) => {
    LocalStorageManager.setToken(accessToken);

    const { data: userRes } = await userControllerGetProfile();
    LocalStorageManager.setUser({
      id: String(userRes!.id),
      email: userRes!.email,
      name: userRes!.username,
    });
    setUser(userRes!);

    if (onClose) onClose();
  }, [setUser]);

  return { handleAuthSuccess };
};
