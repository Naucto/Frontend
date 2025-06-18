import React, { createContext, useContext } from "react";
import { DefaultTheme } from "styled-components";

export const theme: DefaultTheme = {
  colors: {
    primary: "#E5D352",
    secondary: "#537D8D",
    red: "#AC3931",
    gray: "#646464",
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
  spacing: (height: number, width?: number) => {
    if (width) {
      return `${height * 8}px ${width * 8}px`;
    }
    return `${height * 8}px`;
  }
};

type ThemeType = typeof theme;

const ThemeContext = createContext<ThemeType>(theme);

export const useTheme = () => useContext(ThemeContext);
