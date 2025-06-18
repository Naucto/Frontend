import { Link } from "react-router-dom";
import { styled } from "@mui/material/styles";

export const NavElem = styled(Link)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: theme.spacing(2),
  textDecoration: "none",
  color: "white",
  fontSize: "1.2rem",
}));

export const ImportantNavElem = styled(NavElem)(({ theme }) => ({
  backgroundColor: theme.palette.red[500],
  borderRadius: 8,
  padding: theme.spacing(1.5, 3),
}));
