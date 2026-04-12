import { Box } from "@mui/material";
import { styled } from "@mui/material/styles";

export const ButtonContainer = styled(Box)(() => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
  gap: "8px",
  marginTop: "20px",
  width: "100%",
  maxWidth: "250px",
}));

export const MusicSelectionContainer = styled(Box)(() => ({
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "4px",
  marginTop: "20px",
  width: "100%",
  maxWidth: "150px",
}));

export const StyledButton = styled("button")<{ selected?: boolean }>(({ selected }) => ({
  backgroundColor: selected ? "#4c7280" : "#537d8d",
  color: "#ffffff",
  padding: "8px 16px",
  cursor: "pointer",
  fontSize: "16px",
  textAlign: "center",
  textDecoration: "none",
  display: "inline-block",
  boxShadow: "none",
  margin: "4px 2px",
  fontFamily: "'Pixelify', 'Roboto', 'Helvetica', 'Arial', sans-serif",
  borderRadius: "9.6px",
  border: "2px solid #4c7280",
  minWidth: "auto",
  "&:hover": {
    backgroundColor: "#3b5964",
  },
}));

export const MusicSelectionButton = styled(StyledButton)(() => ({
  padding: "4px 8px",
  fontSize: "12px",
  minWidth: "auto",
  width: "100%",
}));

export const NewInstrumentButton = styled(StyledButton)(({ theme }) => ({
  marginTop: theme.spacing(1),
}));

export const ControlButtonsContainer = styled("div")(() => ({
  display: "flex",
  justifyContent: "space-around",
  marginTop: "20px",
}));

export const EditorContainer = styled("div")(() => ({
  display: "flex",
  gap: "20px",
  alignItems: "flex-start",
  width: "100%",
  maxWidth: "100%",
  overflow: "hidden",
}));

export const SoundEditorRoot = styled("div")(() => ({
  width: "100%",
  overflow: "hidden",
}));

export const ErrorMessage = styled("div")(() => ({
  color: "red",
  textAlign: "center",
  marginTop: "10px",
}));

export const SoundEditorWrapper = styled("div")(() => ({
  width: "fit-content",
  maxWidth: "100%",
}));

