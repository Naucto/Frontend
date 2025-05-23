import "styled-components";

// used to get correct types

declare module "styled-components" {
  export interface DefaultTheme {
    colors: {
      primary: string;
      secondary: string;
      red: string;
      blue: any;
      grey: string;
      background: string;
      text: string;
    };
    typography: {
      fontFamily: string;
      fontSize: number;
    };
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
    spacing: (n: number, n2?: number) => string;
  }
}
