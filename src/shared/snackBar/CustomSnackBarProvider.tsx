import { styled } from "@mui/material";
import { MaterialDesignContent, SnackbarProvider } from "notistack";

import CheckIcon from "src/assets/check.svg?react";
import ErrorIcon from "src/assets/cross.svg?react";
import InfoIcon from "src/assets/infoBox.svg?react";
import WarningIcon from "src/assets/warningBox.svg?react";

const styledSnackbar = styled(MaterialDesignContent)(({ theme }) => ({
  "&.notistack-MuiContent-success": {
    backgroundColor: theme.palette.green[300],
    color: "#fff",
  },
  "&.notistack-MuiContent-error": {
    backgroundColor: theme.palette.red[500],
    color: "#fff",
  },
  "&.notistack-MuiContent-info": {
    backgroundColor: theme.palette.blue[500],
    color: "#fff",
  },
  "&.notistack-MuiContent-warning": {
    backgroundColor: theme.palette.yellow[500],
    color: "#000",
  },
}));

const IconWrapper = styled("span")(({ theme }) => ({
  marginRight: theme.spacing(1),
  display: "flex",
  alignItems: "center",
}));

export const CustomSnackBarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <SnackbarProvider
      maxSnack={3}
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      autoHideDuration={3000}
      iconVariant={{
        success: (
          <IconWrapper>
            <CheckIcon style={{ fill: "white" }} />
          </IconWrapper>
        ),
        error: (
          <IconWrapper>
            <ErrorIcon style={{ fill: "white" }} />
          </IconWrapper>
        ),
        warning: (
          <IconWrapper>
            <WarningIcon style={{ fill: "black" }} />
          </IconWrapper>
        ),
        info: (
          <IconWrapper>
            <InfoIcon style={{ fill: "white" }} />
          </IconWrapper>
        ),
      }}
      Components={{
        success: styledSnackbar,
        error: styledSnackbar,
        warning: styledSnackbar,
        info: styledSnackbar,
      }}
    >
      {children}
    </SnackbarProvider>
  );
};
