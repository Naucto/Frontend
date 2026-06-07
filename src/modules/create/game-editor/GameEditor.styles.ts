import GameCanvas from "@shared/canvas/gameCanvas/GameCanvas";
import { DocumentationFrame } from "@shared/docs/DocumentationFrame";

import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Tab } from "@mui/material";
import { styled } from "@mui/material/styles";

export const GameEditorContainer = styled("div")(({ theme }) => ({
  height: "100%",
  display: "flex",
  flexDirection: "row",
  gap: theme.spacing(4),
  padding: `0 calc(${theme.spacing(4)} - 4px) calc(${theme.spacing(4)} - 4px)`,
  boxSizing: "border-box",
}));

export const LeftPanel = styled("div")(() => ({
  width: "100%",
  display: "flex",
  flexDirection: "column",
}));

export const RightPanel = styled("div")(({ theme }) => ({
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(4)
}));

export const RightPanelSubcontainer = styled("div")(() => ({
  display: "flex",
  flexDirection: "column",
  height: "100%"
}));

export const PreviewToolbar = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: theme.spacing(1),
  padding: theme.spacing(1),
  backgroundColor: theme.palette.blue[500],
}));

export const PreviewControls = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1.5),
  flexWrap: "wrap",
}));

export const RunPreviewButton = styled(Button)(({ theme }) => ({
  color: theme.palette.common.white,
  backgroundColor: theme.palette.red[500],
  "&:hover": {
    backgroundColor: theme.palette.red[600],
  },
}));

export const DocIframe = styled(DocumentationFrame)(({ theme }) => ({
  width: "100%",
  height: "50vh",

  border: "none",
  borderRadius: theme.spacing(1),
  borderTopLeftRadius: 0,

  backgroundColor: theme.palette.blue[500],
}));

export const TabContent = styled(Box)(() => ({
  flex: 1,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  "&.active": {
    display: "contents",
  },
  "&.hidden": {
    display: "none",
  },
}));

export const StyledTab = styled(Tab)(({ theme }) => ({
  fontFamily: theme.typography.fontFamily,
  backgroundColor: theme.palette.blue[700],
  minHeight: theme.spacing(6),
  minWidth: theme.spacing(18),
  fontSize: "1.2rem",
  borderTopLeftRadius: theme.spacing(1),
  borderTopRightRadius: theme.spacing(1),
  color: "white",

  "&.Mui-selected, &.Mui-focusVisible": {
    backgroundColor: theme.palette.blue[500],
    color: "white"
  },
  "&:hover": {
    backgroundColor: theme.palette.blue[600],
  },
}));

export const PreviewCanvas = styled(GameCanvas)(({ theme }) => ({
  borderRadius: theme.spacing(1)
}));

export const StyledDialog = styled(Dialog)(({ theme }) => ({
  "& .MuiPaper-root": {
    backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[900] : "#0f0f0f",
    color: theme.palette.getContrastText(theme.palette.grey[900]),
    border: `1px solid ${theme.palette.grey[800]}`,
    boxShadow: theme.shadows[8],
  },
}));

export const StyledDialogTitle = styled(DialogTitle)(() => ({
  color: "inherit",
}));

export const StyledDialogContent = styled(DialogContent)(({ theme }) => ({
  backgroundColor: "transparent",
  borderColor: theme.palette.grey[800],
}));

export const StyledDialogActions = styled(DialogActions)(() => ({
  backgroundColor: "transparent",
}));

export const StyledAlert = styled(Alert)(({ theme }) => ({
  backgroundColor: "transparent",
  color: theme.palette.grey[100],
  borderColor: theme.palette.grey[700],
  "& .MuiAlert-icon": {
    color: theme.palette.grey[400],
  },
}));
