import React from "react";
import { Box, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { DocumentationFrame } from "@shared/docs/DocumentationFrame";

const PageContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  margin: theme.spacing(4),
  gap: theme.spacing(2),
}));

const Title = styled(Typography)(({ theme }) => ({
  color: theme.palette.text.primary,
  fontSize: "32px",
  fontWeight: "normal",
}));

const DocsShell = styled(Box)(({ theme }) => ({
  flex: 1,
  minHeight: "65vh",
  borderRadius: theme.custom.rounded.md,
  overflow: "hidden",
  backgroundColor: theme.palette.blue[500],
}));

const Help: React.FC = () => {
  return (
    <PageContainer>
      <Title variant="h1">Help</Title>
      <DocsShell>
        <DocumentationFrame data-cy="help-doc-iframe" />
      </DocsShell>
    </PageContainer>
  );
};

export default Help;
