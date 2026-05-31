import React, { useEffect, useRef, useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { FEEDBACK_ENGLISH_URL, FEEDBACK_FRENCH_URL } from "@shared/constants/links";

type FeedbackLanguagePickerProps = {
  children: (openDialog: () => void) => React.ReactNode;
};

const RETURN_POPUP_DELAY_MS = 1000;

const StyledDialog = styled(Dialog)(({ theme }) => ({
  "& .MuiPaper-root": {
    backgroundColor: theme.palette.gray[900],
    color: theme.palette.common.white,
    border: `1px solid ${theme.palette.gray[700]}`,
    borderRadius: theme.custom.rounded.md,
    backgroundImage: "none",
  },
}));

const LanguageActions = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: theme.spacing(1.5),
  marginTop: theme.spacing(2.5),
  [theme.breakpoints.down("sm")]: {
    gridTemplateColumns: "1fr",
  },
}));

const LanguageButton = styled(Button)(({ theme }) => ({
  minHeight: 56,
  color: theme.palette.common.white,
  borderColor: "rgba(255, 255, 255, 0.18)",
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  "&:hover": {
    borderColor: theme.palette.yellow[500],
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
}));

function openFeedbackForm(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

export const FeedbackLanguagePicker: React.FC<FeedbackLanguagePickerProps> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [thankYouOpen, setThankYouOpen] = useState(false);
  const [waitingForReturn, setWaitingForReturn] = useState(false);
  const feedbackOpenedAtRef = useRef(0);

  useEffect(() => {
    if (!waitingForReturn) {
      return;
    }

    const showThankYouWhenUserReturns = (): void => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if (Date.now() - feedbackOpenedAtRef.current < RETURN_POPUP_DELAY_MS) {
        return;
      }

      setWaitingForReturn(false);
      setThankYouOpen(true);
    };

    window.addEventListener("focus", showThankYouWhenUserReturns);
    document.addEventListener("visibilitychange", showThankYouWhenUserReturns);

    return () => {
      window.removeEventListener("focus", showThankYouWhenUserReturns);
      document.removeEventListener("visibilitychange", showThankYouWhenUserReturns);
    };
  }, [waitingForReturn]);

  const handleSelect = (url: string): void => {
    setOpen(false);
    feedbackOpenedAtRef.current = Date.now();
    setWaitingForReturn(true);
    openFeedbackForm(url);
  };

  return (
    <>
      {children(() => setOpen(true))}
      <StyledDialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Feedback language</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="gray.300">
            Choose the form language you prefer.
          </Typography>
          <LanguageActions>
            <LanguageButton
              variant="outlined"
              endIcon={<OpenInNewIcon />}
              onClick={() => handleSelect(FEEDBACK_ENGLISH_URL)}
            >
              English
            </LanguageButton>
            <LanguageButton
              variant="outlined"
              endIcon={<OpenInNewIcon />}
              onClick={() => handleSelect(FEEDBACK_FRENCH_URL)}
            >
              Français
            </LanguageButton>
          </LanguageActions>
        </DialogContent>
      </StyledDialog>
      <StyledDialog
        open={thankYouOpen}
        onClose={() => setThankYouOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Thank you</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="gray.300">
            Thank you for giving feedback. It helps us a lot.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setThankYouOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </StyledDialog>
    </>
  );
};
