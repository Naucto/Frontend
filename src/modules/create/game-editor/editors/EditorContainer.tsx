import { Paper } from "@mui/material";
import { styled } from "@mui/material/styles";

export const EditorContainer = styled(Paper)(({ theme }) => ({
  height: "100%",
  boxSizing: "border-box",
  borderTopLeftRadius: 0,
  overflow: "auto",
  backgroundColor: theme.palette.blue[500],
  padding: theme.spacing(3),
}));
