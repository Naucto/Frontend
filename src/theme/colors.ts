import { ColorShades } from "@theme/MUITheme";

export interface Colors {
  gray: ColorShades;
  red: ColorShades;
  yellow: ColorShades;
  blue: ColorShades;
}

export const colors: Colors = {
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
  yellow: {
    50: "#fcfbee",
    100: "#f7f1c9",
    200: "#f3ebaf",
    300: "#eee28a",
    400: "#eadc74",
    500: "#e5d351",
    600: "#d0c04a",
    700: "#a3963a",
    800: "#7e742d",
    900: "#605922",
  },
  blue: {
    50: "#eef2f4",
    100: "#cad7dc",
    200: "#b0c3cb",
    300: "#8ca8b3",
    400: "#7597a4",
    500: "#537d8d",
    600: "#4c7280",
    700: "#3b5964",
    800: "#2e454e",
    900: "#23353b",
  }
};
