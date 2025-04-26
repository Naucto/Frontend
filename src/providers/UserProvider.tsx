import { User } from "src/types/userTypes";
import { createContext, useContext, useEffect, useState } from "react";



interface UserContextType {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
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

  const login = (userData: any) => {
    setUser(userData);
  };
  const logout = () => {
    setUser(null);
  };

  return (
    <userContext.Provider value={{ user, setUser }}>
      {children}
    </userContext.Provider>
  );
}

export const useUser = () => {
  const context = useContext(userContext);
  if (!context) {
    throw new Error("useUser must be used in a userProvider");
  }
  return context;
}