import { createTheme } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Theme {
    border: {
      color: {
        grey: string;
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
        grey: string;
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
    grey1: string;
    grey2: string;
    red: string;
  }
  interface PaletteOptions {
    grey1: string;
    grey2: string;
    red: string;
  }
}

export const muiTheme = createTheme({
  palette: {
    grey1: "#9C9C9C",
    grey2: "",
    red: "#AC3931",
    primary: { main: "#E5D352" },
    secondary: { main: "#537D8D" },
    error: { main: "#AC3931" },
    background: { default: "#303030" },
    text: { primary: "#FFFFFF" },
  },
  border: {
    color: {
      grey: "#646464",
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
          color: theme.palette.grey1,
        }),
      },
    },
  }
});
