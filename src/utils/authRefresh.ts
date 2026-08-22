import { authControllerRefresh } from "@api";
import { LocalStorageManager } from "@utils/LocalStorageManager";

// Single-flight the access-token refresh: concurrent 401s (and the UserProvider
// activity timer) all await one authControllerRefresh() call. With refresh-token
// rotation a burst of parallel refreshes would race and invalidate each other,
// spuriously logging out a user whose session is still valid.
let inFlight: Promise<string | null> | null = null;

export const refreshAccessToken = (): Promise<string | null> => {
  if (inFlight)
    return inFlight;

  inFlight = authControllerRefresh()
    .then(({ data }) => {
      const token = data?.access_token ?? null;
      if (token)
        LocalStorageManager.setToken(token);
      return token;
    })
    .catch(() => null)
    .finally(() => { inFlight = null; });

  return inFlight;
};
