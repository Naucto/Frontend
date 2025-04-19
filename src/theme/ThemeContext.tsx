import React, { createContext, useContext } from "react";
import { DefaultTheme } from "styled-components";


export const theme: DefaultTheme = {
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
  spacing: (n: number) => `${n * 8}px`,
}

type ThemeType = typeof theme;

const ThemeContext = createContext<ThemeType>(theme);

export const useTheme = () => useContext(ThemeContext);