import { ConfirmDialog } from "@components/ui/ConfirmDialog";
import * as urls from "@shared/navigation/routes";
import { LocalStorageManager } from "@utils/LocalStorageManager";

import { type JSX, type ReactNode } from "react";

import { Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

// Gate a route behind being logged in. Not logged in (no token) ⇒ show an error
// notice and send the user back to the hub instead of letting the page 401 into
// the error boundary.
export const RequireAuth = ({ children }: { children: ReactNode }): JSX.Element => {
  const navigate = useNavigate();

  if (LocalStorageManager.getToken())
    return <>{children}</>;

  const goHome = (): void => {
    void navigate(urls.toHub());
  };

  return (
    <ConfirmDialog
      open
      title="Login required"
      onClose={goHome}
      onConfirm={goHome}
      confirmLabel="Go to the hub"
      confirmColor="primary"
    >
      <Typography>You need to be logged in to open this project.</Typography>
    </ConfirmDialog>
  );
};
