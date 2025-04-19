import "styled-components";

// used to get correct types

declare module "styled-components" {
  export interface DefaultTheme {
    colors: {
      primary: string;
      secondary: string;
      red: string;
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
    spacing: (n: number) => string;
  }
}
