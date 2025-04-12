import React, { createContext, useContext } from "react";


export const theme = {
  colors: {
    primary: "#E5D352",
    secondary: "#537D8D",
    red: "#AC3931",
    grey: "#646464",
    background: "#303030",
    text: "#FFFFFF",
  },
  typography: {
    fontFamily: "'Roboto', sans-serif",
    fontSize: 16,
  },
  logo: {
    primary: "/img/logo.png",
    secondary: "/img/logo.png",
  },
}

type ThemeType = typeof theme;

const ThemeContext = createContext<ThemeType>(theme);


export const useTheme = () => useContext(ThemeContext);