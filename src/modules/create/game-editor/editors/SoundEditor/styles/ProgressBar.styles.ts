import { styled } from "@mui/material/styles";

export const ProgressBarContainer = styled("div")(() => ({
  width: "1120px",
  height: "30px",
  marginTop: "10px",
  marginBottom: "10px",
  position: "relative",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  marginLeft: "3px",
}));

export const ProgressBarTrack = styled("div")(() => ({
  width: "100%",
  height: "8px",
  backgroundColor: "#3a5863",
  borderRadius: "4px",
  position: "relative",
  overflow: "hidden",
}));

export const ProgressBarFill = styled("div")<{ width: string }>(({ width }) => ({
  height: "100%",
  width: width,
  backgroundColor: "#00BCD4",
  borderRadius: "4px",
  transition: "width 0.1s linear",
}));

export const ProgressBarThumb = styled("div")<{ left: string }>(({ left }) => ({
  position: "absolute",
  top: "50%",
  left: left,
  transform: "translate(-50%, -50%)",
  width: "16px",
  height: "16px",
  backgroundColor: "#4c7280",
  borderRadius: "50%",
  cursor: "pointer",
  border: "2px solid #7597a4",
  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.3)",
  "&:hover": {
    backgroundColor: "#3b5964",
    transform: "translate(-50%, -50%) scale(1.2)",
  },
}));

