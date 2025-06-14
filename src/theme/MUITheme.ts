import { createTheme } from "@mui/material/styles";

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
    border: {
      color: {
        gray: string;
      }
    }
    custom: {
      logo: {
        primary: string;
        secondary: string;
      };
      rounded: {
        sm: string;
        md: string;
        lg: string;
        fill: string;
      };
    };
  }
  interface ThemeOptions {
    border?: {
      color?: {
        gray?: string;
      }
    }
    custom?: {
      logo?: {
        primary?: string;
        secondary?: string;
      };
      rounded?: {
        sm?: string;
        md?: string;
        lg?: string;
        fill?: string;
      };
    };
  }
  interface Palette {
    gray: ColorShades;
    red: ColorShades;
  }
  interface PaletteOptions {
    gray: ColorShades;
    red: ColorShades;
  }
}

export const muiTheme = createTheme({
  palette: {
    gray: {
      50: "#ececec",
      100: "#c3c3c3",
      200: "#a6a6a6",
      300: "#7e7e7e",
      400: "#656565",
      500: "#3e3e3e",
      600: "#383838",
      700: "#2c2c2c",
      800: "#222222",
      900: "#1a1a1a",
    },
    red: {
      50: "#f7ebea",
      100: "#e5c2bf",
      200: "#d9a4a0",
      300: "#c77a75",
      400: "#bd615a",
      500: "#ac3931",
      600: "#9d342d",
      700: "#7a2823",
      800: "#5f1f1b",
      900: "#481815",
    },

    primary: { main: "#E5D352" },
    secondary: { main: "#537D8D" },
    error: { main: "#AC3931" },
    background: { default: "#303030" },
    text: { primary: "#FFFFFF" },
  },
  border: {
    color: {
      gray: "#646464",
    },
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
