import React, { createContext, useContext } from "react";
import { DefaultTheme } from "styled-components";

export const theme: DefaultTheme = {
  colors: {
    primary: "#E5D352",
    secondary: "#537D8D",
    red: "#AC3931",
    grey: "#646464",
    blue: {
      500: "#537D8D",
      600: "#3a5863",
    },
    background: "#303030",
    text: "#FFFFFF",
  },
  typography: {
    fontFamily: "Pixelify",
    fontSize: 16,
  },
  logo: {
    primary: "/img/logo.png",
    secondary: "/img/logo.png",
  },
  rounded: {
    sm: "4px",
    md: "8px",
    lg: "12px",
    fll: "50%",
  },
  spacing: (n: number, n2?: number) => {
    if (n2) {
      return `${n * 8}px ${n2 * 8}px`;
    }
    return `${n * 8}px`;
  }

};

type ThemeType = typeof theme;

const ThemeContext = createContext<ThemeType>(theme);

export const useTheme = () => useContext(ThemeContext);
