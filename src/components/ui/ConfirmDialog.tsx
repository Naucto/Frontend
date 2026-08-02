import React, { ReactNode } from "react";

import { Button, ButtonProps, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: ButtonProps["color"];
  confirmDisabled?: boolean;
  role?: string;
  children?: ReactNode;
}

/**
 * Standard MUI confirm/form dialog shell: title, body (children), and a
 * Cancel + primary-action footer. Use for confirmations and small forms.
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
  children,
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth role={role}>
    <DialogTitle>{title}</DialogTitle>
    <DialogContent>{children}</DialogContent>
    <DialogActions>
      <Button onClick={onClose}>{cancelLabel}</Button>
      <Button onClick={onConfirm} color={confirmColor} disabled={confirmDisabled} autoFocus>
        {confirmLabel}
      </Button>
    </DialogActions>
  </Dialog>
);
