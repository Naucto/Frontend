import { styled } from "@mui/material/styles";

export const ScrollableContainer = styled("div")(() => ({
  maxWidth: "45%",
  maxHeight: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  display: "flex",
  flexDirection: "column",
  flexWrap: "nowrap",
}));

export const GridWithProgressContainer = styled("div")(() => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
}));

export const GridContainer = styled("div")(() => ({
  width: "max-content",
  display: "grid",
  gridTemplateColumns: "repeat(32, 35px)",
  gridTemplateRows: "repeat(24, 20px)",
  marginTop: "1em",
  rowGap: "2px",
  backgroundColor: "#537D8D",
  boxSizing: "border-box",
  border: "3px solid #537D8D",
}));

export const GridCell = styled("div")<{ isActive?: boolean; isPlayingColumn?: boolean }>(({ isActive, isPlayingColumn }) => ({
  width: "35px",
  height: "20px",
  boxSizing: "border-box",
  backgroundColor: isPlayingColumn
    ? "rgba(0, 188, 212, 0.4)"
    : isActive
      ? "#2a3c45"
      : "#3a5863",
  color: isActive ? "black" : "transparent",
  userSelect: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: isActive ? "12px" : "10px",
  fontWeight: isActive ? "bold" : "normal",
  borderLeft: isPlayingColumn ? "3px solid #00BCD4" : "none",
  borderRight: isPlayingColumn ? "3px solid #00BCD4" : "none",
  boxShadow: isPlayingColumn ? "0 0 8px rgba(0, 188, 212, 0.8)" : "none",
  transition: isPlayingColumn ? "background-color 0.1s ease, box-shadow 0.1s ease" : "none",
  "&:hover": {
    backgroundColor: isPlayingColumn
      ? "rgba(0, 188, 212, 0.5)"
      : "#2a3c45",
  },
}));

