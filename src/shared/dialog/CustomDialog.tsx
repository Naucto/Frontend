import { Backdrop, Box, styled, IconButton, Button } from "@mui/material";
import React, { ReactNode, useCallback, useEffect } from "react";
import CrossIcon from "@assets/cross.svg?react";

const Dialog = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  position: "relative",
  width: 552,
  height: 580,
  backgroundColor: theme.palette.background.default,
  borderRadius: 16,
  color: theme.palette.text.primary,
  zIndex: 1000,
  padding: theme.spacing(6),
}));

const CloseButton = styled(IconButton)(({ theme }) => ({
  position: "absolute",
  right: theme.spacing(2),
  top: theme.spacing(2),
}));

const Content = styled(Box)(({ theme }) => ({
  flex: 1,
  marginTop: theme.spacing(4),
}));

const Footer = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(4),
  display: "flex",
  justifyContent: "flex-end",
}));

interface CustomDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onClose?: () => void;
  onSubmit?: () => void;
  hideSubmitButton?: boolean;
  children?: ReactNode;
}

export const CustomDialog: React.FC<CustomDialogProps> = ({
  isOpen,
  setIsOpen,
  onClose,
  onSubmit,
  hideSubmitButton = false,
  children,
}) => {

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, setIsOpen]);
  const handleClose = useCallback(() => {
    onClose?.();
    setIsOpen(false);
  }, [onClose, setIsOpen]);

  return (
    <Backdrop open={isOpen} onClick={handleClose}>
      <Dialog onClick={(e) => e.stopPropagation()}>
        <CloseButton aria-label="close" onClick={handleClose}>
          <CrossIcon width={32} height={32} />
        </CloseButton>
        <Content>{children}</Content>
        {!hideSubmitButton && (
          <Footer>
            <Button onClick={onSubmit}>
              Submit
            </Button>
          </Footer>
        )}
      </Dialog>
    </Backdrop >
  );
};
