import { Box, LinearProgress, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";

export const PageContainer = styled("div")(({ theme }) => ({
  margin: theme.spacing(4),
}));

export const ProjectGrid = styled("div", {
  shouldForwardProp: (prop) => prop !== "$withTopMargin",
})<{ $withTopMargin?: boolean }>(({ theme, $withTopMargin = false }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
  gap: theme.spacing(2),
  alignItems: "start",
  marginTop: $withTopMargin ? theme.spacing(3) : 0,
}));

export const EmptyState = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontSize: "15px",
  padding: theme.spacing(3, 0),
}));

export const LoadMoreRow = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "center",
  marginTop: theme.spacing(2),
}));

export const LoadMoreContent = styled(Box)({
  width: "100%",
  maxWidth: 320,
});

export const LoadMoreProgress = styled(LinearProgress)(({ theme }) => ({
  marginTop: theme.spacing(1),
  borderRadius: 999,
}));
