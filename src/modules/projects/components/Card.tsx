import { Button, ButtonProps, styled } from "@mui/material";
import React from "react";

interface CardProps extends ButtonProps {
  children?: React.ReactNode;
}

export const ProjectCardContainer = styled(Button)(({ theme }) => ({
  width: "100%",
  maxWidth: "360px",
  height: "180px",
  backgroundColor: theme.palette.gray[300],

  "&:hover, &:focus": {
    backgroundColor: theme.palette.gray[500],
  },
}));

const Card: React.FC<CardProps> = ({ children, ...props }) => {
  return (
    <ProjectCardContainer {...props} disableRipple>
      {children}
    </ProjectCardContainer>
  );
};

export default Card;
