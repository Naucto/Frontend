import { User } from "src/types/userTypes";
import { createContext, useContext, useEffect, useState } from "react";
import { ContextError } from "src/errors/ContextError";

interface UserContextType {
  user?: User;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  logIn: (userData: User) => void;
  logOut: () => void;
}

const userContext = createContext<UserContextType | null>(null);

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      return JSON.parse(storedUser);
    }
    return null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem("user", JSON.stringify(user));
    } else {
      localStorage.removeItem("user");
    }
  }, [user]);

  const logIn = (userData: User) => setUser(userData);

  const logOut = () => setUser(null);

  return (
    <userContext.Provider value={{ user, setUser, logIn, logOut }}>
      {children}
    </userContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(userContext);
  if (!context) {
    throw new ContextError("useUser", "UserProvider");
  }
  return context;
};
