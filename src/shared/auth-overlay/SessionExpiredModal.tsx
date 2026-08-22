import { ConfirmDialog } from "@components/ui/ConfirmDialog";
import { useUser } from "@providers/UserProvider";

import { type JSX } from "react";

import { Typography } from "@mui/material";

// Global notice shown when an active session expired and couldn't be refreshed.
export const SessionExpiredModal = (): JSX.Element | null => {
  const { sessionExpired, dismissSessionExpired } = useUser();

  if (!sessionExpired)
    return null;

  return (
    <ConfirmDialog
      open
      title="You've been logged out"
      onClose={dismissSessionExpired}
      onConfirm={dismissSessionExpired}
      confirmLabel="OK"
      confirmColor="primary"
    >
      <Typography>You were logged out due to inactivity. Please log in again.</Typography>
    </ConfirmDialog>
  );
};
