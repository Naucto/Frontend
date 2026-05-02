import type { MenuProps } from "@mui/material/Menu";

export const DARK_MENU_PAPER_CLASS_NAME = "naucto-dark-menu-paper";

export const darkMenuProps = {
  slotProps: {
    paper: {
      className: DARK_MENU_PAPER_CLASS_NAME,
    },
  },
} satisfies Partial<MenuProps>;
