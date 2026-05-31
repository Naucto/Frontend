import { Link } from "react-router-dom";
import { styled, type Theme } from "@mui/material/styles";

const navElementStyles = ({ theme }: { theme: Theme }): Record<string, string | number> => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: theme.spacing(1),
  textDecoration: "none",
  color: "white",
  fontSize: "1.2rem",
  gap: theme.spacing(0.75),
});

export const NavElem = styled(Link)(navElementStyles);

export const ExternalNavElem = styled("a")(navElementStyles);

export const NavActionButton = styled("button")(({ theme }) => ({
  ...navElementStyles({ theme }),
  border: "none",
  background: "transparent",
  fontFamily: theme.typography.fontFamily,
  cursor: "pointer",
  padding: 0,
  "&:disabled": {
    cursor: "wait",
    opacity: 0.72,
  },
}));

export const ImportantNavElem = styled(NavElem)(({ theme }) => ({
  backgroundColor: theme.palette.red[500],
  borderRadius: 8,
  padding: theme.spacing(1.5, 3),
}));

export const ImportantNavActionButton = styled(NavActionButton)(({ theme }) => ({
  backgroundColor: theme.palette.red[500],
  borderRadius: 8,
  padding: theme.spacing(1.5, 3),
  "&:hover": {
    backgroundColor: theme.palette.red[600],
  },
}));
