import { Paper, PaperProps } from "@mui/material";
import { styled } from "@mui/material/styles";

interface EditorContainerProps extends PaperProps {
  $disablePadding?: boolean;
}

export const EditorContainer = styled(Paper, {
  shouldForwardProp: (prop) => prop !== "$disablePadding",
})<EditorContainerProps>(({ theme, $disablePadding }) => ({
  height: "100%",
  boxSizing: "border-box",
  borderTopLeftRadius: 0,
  overflow: "auto",
  backgroundColor: theme.palette.blue[500],
  padding: $disablePadding ? 0 : theme.spacing(3),
}));

