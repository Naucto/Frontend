import React from "react";
import { Box, Typography } from "@mui/material";
import { styled } from "@mui/system";

const ConsoleContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: theme.palette.blue[500],
  color: theme.palette.text.primary,
  borderRadius: theme.spacing(1)
}));

const TitleBox = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  padding: theme.spacing(1),
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

interface PanelProps {
  title: string;
  children?: React.ReactNode;
}

const Panel: React.FC<PanelProps> = ({ title, children }) => {
  return (
    <ConsoleContainer>
      <TitleBox>
        <Typography variant="subtitle2">
          {title}
        </Typography>
      </TitleBox>
      {children}
    </ConsoleContainer>
  );
};

export default Panel;
