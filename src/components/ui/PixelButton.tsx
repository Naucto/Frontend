import React from "react";
import { IconButton, IconButtonProps } from "@mui/material";
import { styled } from "@mui/material/styles";

interface PixelButtonProps extends Omit<IconButtonProps, 'color'> {
  variant?: "danger" | "primary" | "secondary";
}

const StyledPixelButton = styled(IconButton, {
  shouldForwardProp: (prop) => prop !== 'variant',
})<PixelButtonProps>(({ theme, variant = "danger" }) => {
  const colors = {
    danger: {
      bg: theme.palette.red?.[500] || "#ef4444",
      hover: theme.palette.red?.[600] || "#dc2626",
    },
    primary: {
      bg: theme.palette.blue?.[500] || "#3b82f6",
      hover: theme.palette.blue?.[600] || "#2563eb",
    },
    secondary: {
      bg: theme.palette.grey?.[500] || "#6b7280",
      hover: theme.palette.grey?.[600] || "#4b5563",
    },
  };

  return {
    backgroundColor: colors[variant].bg,
    color: "white",
    borderRadius: "4px",
    minWidth: "32px",
    minHeight: "32px",
    padding: theme.spacing(1),
    fontSize: "1.25rem",
    fontWeight: "bold",
    fontFamily: "monospace",
    transition: "none",
    "&:hover": {
      backgroundColor: colors[variant].hover,
    },
    "&:active": {
      transform: "translateY(1px)",
    },
  };
});

export const PixelButton: React.FC<PixelButtonProps> = ({ children, variant = "danger", ...props }) => {
  return (
    <StyledPixelButton variant={variant} {...props}>
      {children}
    </StyledPixelButton>
  );
};
