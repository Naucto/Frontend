import { User } from "src/types/userTypes";
import React, { createContext, useContext, useEffect, useState } from "react";
import { ContextError } from "src/errors/ContextError";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import { UserProfileResponseDto, UsersService } from "@api";
import { useAsync } from "src/hooks/useAsync";

interface UserContextType {
  logIn: (userData: User) => void;
  logOut: () => void;
  user: UserProfileResponseDto | undefined;
  setUser: React.Dispatch<React.SetStateAction<UserProfileResponseDto | undefined>>;
}

const userContext = createContext<UserContextType | null>(null);

export const UserProvider = ({ children }: { children: React.ReactNode }): React.ReactElement => {
  const { loading, value: profile } = useAsync(UsersService.userControllerGetProfile, []);
  const [user, setUser] = useState<UserProfileResponseDto | undefined>(undefined);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (profile) {
      setUser(profile);
    } else {
      logOut();
    }
  }, [loading, profile]);

  const logIn = (userData: User): void => LocalStorageManager.setUser(userData);

  const logOut = (): void => {
    LocalStorageManager.setUser(undefined);
    LocalStorageManager.setToken(undefined);
    setUser(undefined);
  };

  return (
    <userContext.Provider value={{ user, setUser, logIn, logOut }}>
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
