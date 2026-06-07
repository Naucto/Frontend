import { alpha } from "@mui/material/styles";
import type { MenuProps } from "@mui/material/Menu";

export const darkMenuProps: Partial<MenuProps> = {
  slotProps: {
    paper: {
      sx: {
        backgroundColor: "gray.900",
        color: "common.white",
        backgroundImage: "none",
        "& .MuiMenuItem-root": {
          color: "common.white",
        },
        "& .MuiMenuItem-root.Mui-selected": {
          backgroundColor: (theme) => alpha(theme.palette.yellow[500], 0.18),
        },
        "& .MuiMenuItem-root:hover, & .MuiMenuItem-root.Mui-selected:hover": {
          backgroundColor: (theme) => alpha(theme.palette.common.white, 0.08),
        },
      },
    },
  },
};
