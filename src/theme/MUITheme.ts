import { createTheme } from "@mui/material/styles";

interface ColorShades {
  50?: string;
  100?: string;
  200?: string;
  300?: string;
  400?: string;
  500?: string;
  600?: string;
  700?: string;
  800?: string;
  900?: string;
}

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
        fll: string;
      };
    };
  }
  interface ThemeOptions {
    border: {
      color: {
        gray: string;
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
        fll?: string;
      };
    };
  }
  interface Palette {
    gray1: string;
    gray2: string;
    gray: ColorShades;
    red: string;
  }
  interface PaletteOptions {
    gray1: string;
    gray2: string;
    gray: ColorShades;
    red: string;
  }
}

export const muiTheme = createTheme({
  palette: {
    //FIXME: replace gray1 and gray2 with gray shades
    gray1: "#9C9C9C",
    gray2: "",
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
    //FIXME: replace colors with shades
    red: "#AC3931",

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
  shape: {
    borderRadius: 8,
  },
  spacing: 8,
  custom: {
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
  },
  components: {
    MuiLink: {
      styleOverrides: {
        root: ({ theme }) => ({
          color: theme.palette.gray1,
        }),
      },
    },
  }
});
