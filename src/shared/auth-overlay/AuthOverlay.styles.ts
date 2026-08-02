import GenericTextField from "@components/ui/GenericTextField";
import ImportantButton from "@shared/buttons/ImportantButton";

import { Box, styled } from "@mui/material";

interface OAuthButtonProps {
  bgColor?: string;
  textColor?: string;
}

export const StyledTitle = styled("h2")(({ theme }) => ({
  fontSize: "32px",
  margin: 0,
  fontWeight: "normal",
  padding: theme.spacing(0, 0),
  marginBottom: theme.spacing(1),
}));

export const StyledTextField = styled(GenericTextField)(() => ({
  width: "100%",
  height: "42px",
}));

export const FieldContainer = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2.5),
}));

export const StyledImportantButton = styled(ImportantButton)(({ theme }) => ({
  marginTop: theme.spacing(4),
  width: "100%",
  height: "48px",
  backgroundColor: theme.palette.red[500]
}));

export const PixelIcon = styled("img")({
  width: "20px",
  height: "20px",
  imageRendering: "pixelated",
  marginRight: "8px",
});

export const OAuthButtonsContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "stretch",
  gap: theme.spacing(1),
  marginBottom: theme.spacing(3),
  width: "100%"
}));

export const OAuthButton = styled(ImportantButton, {
  shouldForwardProp: (prop) => prop !== "bgColor" && prop !== "textColor",
})<OAuthButtonProps>(({ bgColor, textColor }) => ({
  flex: 1,
  height: "40px",
  fontSize: "12px",
  fontWeight: 500,
  minWidth: 0,
  padding: "4px 8px",
  backgroundColor: bgColor || "#18181b",
  color: textColor || "#ffffff",
  transition: "background-color 0.2s, filter 0.2s",
  "&:hover": {
    backgroundColor: bgColor || "#27272a",
    filter: "brightness(0.92)",
  },
  "&:active": {
    filter: "brightness(0.85)",
  }
}));

export const Center = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2.5),
  fontSize: 24,
  color: theme.palette.gray[200],
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
}));
