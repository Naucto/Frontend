import { authControllerRefresh, userControllerGetProfile, UserProfileResponseDto } from "@api";
import { ContextError } from "@errors/ContextError";
import { useAsync } from "@hooks/useAsync";
import { User } from "@typedefs/userTypes";
import { AUTH_EXPIRED_EVENT } from "@utils/authEvents";
import { LocalStorageManager } from "@utils/LocalStorageManager";

import React, { createContext, useContext, useEffect, useState } from "react";

// User-interaction events that count as "active", and how often an active session
// refreshes its access token (kept well under the access-token TTL).
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "touchstart"] as const;
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

interface UserContextType {
  logIn: (userData: User) => void;
  logOut: () => void;
  user: UserProfileResponseDto | undefined;
  setUser: React.Dispatch<React.SetStateAction<UserProfileResponseDto | undefined>>;
  sessionExpired: boolean;
  dismissSessionExpired: () => void;
}

const userContext = createContext<UserContextType | null>(null);

export const UserProvider = ({ children }: { children: React.ReactNode }): React.ReactElement => {
  const token = LocalStorageManager.getToken();
  const { loading, value: profile, error } = useAsync(
    () => token ? userControllerGetProfile().then(({ data }) => data) : Promise.resolve(undefined),
    [token]
  );
  const [user, setUser] = useState<UserProfileResponseDto | undefined>(undefined);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (profile) {
      setUser(profile);
    }
  }, [loading, profile, error]);

  // The API client emits this when an expired session can't be refreshed: clear
  // local auth and prompt re-login.
  useEffect(() => {
    const onExpired = (): void => {
      LocalStorageManager.resetUser();
      setUser(undefined);
      setSessionExpired(true);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  // Keep an actively-used session alive: while the user interacts, periodically
  // refresh the access token. An idle user stops refreshing, so the token
  // eventually lapses and the next request triggers the expiry flow above.
  useEffect(() => {
    if (!user) {
      return;
    }

    let active = false;
    const markActive = (): void => { active = true; };
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, markActive, { passive: true }));

    const interval = setInterval(() => {
      if (!active) {
        return;
      }
      active = false;
      void authControllerRefresh().then(({ data }) => {
        if (data?.access_token) {
          LocalStorageManager.setToken(data.access_token);
        }
      });
    }, REFRESH_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, markActive));
      clearInterval(interval);
    };
  }, [user]);

  const logIn = (userData: User): void => LocalStorageManager.setUser(userData);

  const logOut = (): void => {
    LocalStorageManager.resetUser();
    setUser(undefined);
  };

  const dismissSessionExpired = (): void => setSessionExpired(false);

  return (
    <userContext.Provider value={{ user, setUser, logIn, logOut, sessionExpired, dismissSessionExpired }}>
      {children}
    </userContext.Provider>
  );
};

export const useUser = (): UserContextType => {
  const context = useContext(userContext);
  if (!context) {
    throw new ContextError("useUser", "UserProvider");
  }
  return context;
};
