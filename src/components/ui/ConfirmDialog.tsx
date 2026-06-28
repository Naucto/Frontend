import React, { ReactNode } from "react";

import { Button, ButtonProps, Dialog, DialogActions, DialogContent, DialogProps, DialogTitle } from "@mui/material";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: ButtonProps["color"];
  confirmDisabled?: boolean;
  role?: string;
  maxWidth?: DialogProps["maxWidth"];
  // Replaces the default Cancel/Confirm footer when provided.
  actions?: ReactNode;
  // Renders no footer at all (e.g. dialogs whose actions live in the body).
  hideActions?: boolean;
  children?: ReactNode;
}

/**
 * Standard MUI dialog shell: title, body (children), and a footer. By default
 * the footer is a Cancel + primary-action pair; pass `actions` to override it
 * or `hideActions` to drop it. Use for confirmations, small forms, and notices.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  onClose,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmColor,
  confirmDisabled = false,
  role,
  maxWidth = "sm",
  actions,
  hideActions = false,
  children,
}) => (
  <Dialog open={open} onClose={onClose} maxWidth={maxWidth} fullWidth role={role}>
    <DialogTitle>{title}</DialogTitle>
    <DialogContent>{children}</DialogContent>
    {!hideActions && (
      <DialogActions>
        {actions ?? (
          <>
            <Button onClick={onClose}>{cancelLabel}</Button>
            <Button onClick={onConfirm} color={confirmColor} disabled={confirmDisabled} autoFocus>
              {confirmLabel}
            </Button>
          </>
        )}
      </DialogActions>
    )}
  </Dialog>
);
