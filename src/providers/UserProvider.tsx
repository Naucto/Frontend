import { User } from "src/types/userTypes";
import React, { createContext, useContext, useEffect, useState } from "react";
import { ContextError } from "src/errors/ContextError";
import { LocalStorageManager } from "@utils/LocalStorageManager";

interface UserContextType {
  userId?: number;
  userName?: string;
  setUserId: React.Dispatch<React.SetStateAction<number>>;
  setUserName: React.Dispatch<React.SetStateAction<string>>;
  logIn: (userData: User) => void;
  logOut: () => void;
}

const userContext = createContext<UserContextType | null>(null);

export const UserProvider = ({ children }: { children: React.ReactNode }): React.ReactElement => {
  const [userId, setUserId] = useState(() => {
    return LocalStorageManager.getUserId();
  });
  const [userName, setUserName] = useState(() => {
    return LocalStorageManager.getUserName();
  });

  useEffect(() => {
    LocalStorageManager.setUserId(userId);
  }, [userId]);

  const logIn = (userData: User): void => LocalStorageManager.setUser(userData);

  const logOut = (): void => LocalStorageManager.setUser(undefined);

  return (
    <userContext.Provider value={{ userId, userName, setUserId, setUserName, logIn, logOut }}>
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
