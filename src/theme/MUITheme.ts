/* eslint-disable @typescript-eslint/no-empty-object-type */

import { createTheme } from "@mui/material/styles";
import { Colors, colors } from "./colors";
export type ColorShades = Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>;

type LogoConfig = {
  primary: string;
  secondary: string;
};

type RoundedConfig = {
  sm: string;
  md: string;
  lg: string;
  fll: string;
};

type BorderConfig = {
  color: {
    gray: string;
  };
};

interface ColorShades {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
}

type LogoConfig = {
  primary: string;
  secondary: string;
};

type RoundedConfig = {
  sm: string;
  md: string;
  lg: string;
  fll: string;
};

type BorderConfig = {
  color: {
    gray: string;
  };
};

declare module "@mui/material/styles" {
  interface Theme {
    border: BorderConfig;
    custom: {
      logo: LogoConfig;
      rounded: RoundedConfig;
    };
  }
  interface ThemeOptions {
    border?: BorderConfig;
    custom?: {
      logo?: LogoConfig;
      rounded?: RoundedConfig;
    };
  }

  interface Palette extends Colors { }
  interface PaletteOptions extends Partial<Colors> { }
}

export const muiTheme = createTheme({
  palette: {
    ...colors,

    primary: { main: "#E5D352" },
    secondary: { main: "#537D8D" },
    error: { main: "#AC3931" },
    background: { default: "#303030" },
    text: { primary: "#FFFFFF" },
  },
  typography: {
    fontFamily: "'Pixelify', 'Roboto', 'Helvetica', 'Arial', sans-serif",
    fontSize: 16,
  },
  custom: {
    logo: {
      primary: "/img/logo.png",
      secondary: "/img/logo.png",
    },
    rounded: {
      sm: "4px",
      md: "8px",
      lg: "12px",
      fill: "50%",
    },
  },
  components: {
    MuiLink: {
      styleOverrides: {
        root: ({ theme }) => ({
          color: theme.palette.gray[200],
        }),
      },
    },
  }
});
