import React from "react";
import { IconButton, IconButtonProps } from "@mui/material";
import { styled } from "@mui/material/styles";

interface ActionButtonProps extends Omit<IconButtonProps, "color"> {
  variant?: "danger" | "primary" | "secondary";
}

const StyledActionButton = styled(IconButton, {
  shouldForwardProp: (prop) => prop !== "variant",
})<ActionButtonProps>(({ theme, variant = "danger" }) => {
  const colors = {
    danger: {
      bg: theme.palette.red?.[500],
      hover: theme.palette.red?.[600],
    },
    primary: {
      bg: theme.palette.blue?.[500],
      hover: theme.palette.blue?.[600],
    },
    secondary: {
      bg: theme.palette.grey?.[500],
      hover: theme.palette.grey?.[600],
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

export const ActionButton: React.FC<ActionButtonProps> = ({ children, variant = "danger", ...props }) => {
  return (
    <StyledActionButton variant={variant} {...props}>
      {children}
    </StyledActionButton>
  );
};
