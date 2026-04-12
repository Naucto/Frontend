import { styled } from "@mui/material/styles";

export const SelectedSpriteFrame = styled("div", {
  shouldForwardProp: (prop) => !["$left", "$top", "$width", "$height"].includes(String(prop)),
})<{ $left: string; $top: string; $width: string; $height: string }>(({ $left, $top, $width, $height, theme }) => ({
  position: "absolute",
  left: $left,
  top: $top,
  width: $width,
  height: $height,
  boxSizing: "border-box",
  border: `2px solid ${theme.palette.gray[100]}`,
}));
