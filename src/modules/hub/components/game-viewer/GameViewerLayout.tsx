import CloseIcon from "@mui/icons-material/Close";
import { Box, CircularProgress, IconButton, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { type JSX, type ReactNode } from "react";

type GameViewerLayoutProps = {
  children: ReactNode;
  onClose: () => void;
};

type MissingProjectViewerProps = {
  onClose: () => void;
};

export const Overlay = styled(Box)(() => ({
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.64)",
  backdropFilter: "blur(6px)",
  zIndex: 9999,
  overflowY: "auto",
}));

export const Container = styled(Box)(({ theme }) => ({
  maxWidth: "1200px",
  margin: "0 auto",
  padding: theme.spacing(4),
  position: "relative",
}));

export const GameTitle = styled(Typography)(({ theme }) => ({
  color: theme.palette.common.white,
  marginBottom: theme.spacing(2),
  textAlign: "center",
}));

const CloseButton = styled(IconButton)(({ theme }) => ({
  position: "absolute",
  top: theme.spacing(2),
  right: theme.spacing(2),
  color: theme.palette.common.white,
  backgroundColor: "rgba(0, 0, 0, 0.28)",
  "&:hover": {
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
}));

export const GameViewerLayout = ({ children, onClose }: GameViewerLayoutProps): JSX.Element => (
  <Overlay>
    <Container>
      <CloseButton onClick={onClose}>
        <CloseIcon />
      </CloseButton>
      {children}
    </Container>
  </Overlay>
);

export const LoadingGameViewer = (): JSX.Element => (
  <Overlay>
    <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
      <CircularProgress />
    </Box>
  </Overlay>
);

export const MissingProjectViewer = ({ onClose }: MissingProjectViewerProps): JSX.Element => (
  <GameViewerLayout onClose={onClose}>
    <Typography color="white" textAlign="center">Project not found</Typography>
  </GameViewerLayout>
);
