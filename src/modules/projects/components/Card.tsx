import { Button, ButtonProps, styled } from "@mui/material";
import React from "react";

interface CardProps extends ButtonProps {
  children?: React.ReactNode;
}

export const CardContainer = styled(Button)(({ theme }) => ({
  width: "100%",
  maxWidth: "360px",
  height: "180px",
  backgroundColor: theme.palette.gray[300],
  borderRadius: theme.custom.rounded.md,

  "&:hover, &:focus": {
    backgroundColor: theme.palette.gray[500],
  },
}));

const Card: React.FC<CardProps> = ({ children, ...props }) => {
  return (
    <CardContainer {...props} disableRipple>
      {children}
    </CardContainer>
  );
};

export default Card;
