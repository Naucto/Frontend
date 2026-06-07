import { Box, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { type JSX, type ReactNode } from "react";

type ProjectPageHeaderVariant = "split" | "stacked";

type ProjectPageHeaderProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  variant?: ProjectPageHeaderVariant;
};

const HeaderRow = styled(Box, {
  shouldForwardProp: (prop) => prop !== "$variant",
})<{ $variant: ProjectPageHeaderVariant }>(({ theme, $variant }) => ({
  display: "flex",
  gap: theme.spacing(2),
  flexWrap: "wrap",
  alignItems: $variant === "stacked" ? "flex-start" : "center",
  flexDirection: $variant === "stacked" ? "column" : "row",
  justifyContent: $variant === "stacked" ? "flex-start" : "space-between",
}));

const HeaderCopy = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(0.75),
}));

const HeaderTitle = styled(Typography)(({ theme }) => ({
  fontSize: "32px",
  color: theme.palette.text.primary,
  fontWeight: "normal",
  padding: theme.spacing(0, 0),
}));

const HeaderSubtitle = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontSize: "14px",
}));

const HeaderControls = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1),
  flexWrap: "wrap",
  justifyContent: "flex-start",
}));

export const ProjectPageHeader = ({
  title,
  subtitle,
  children,
  variant = "split",
}: ProjectPageHeaderProps): JSX.Element => (
  <HeaderRow $variant={variant}>
    <HeaderCopy>
      <HeaderTitle variant="h1">{title}</HeaderTitle>
      {subtitle ? <HeaderSubtitle>{subtitle}</HeaderSubtitle> : null}
    </HeaderCopy>
    {children ? <HeaderControls>{children}</HeaderControls> : null}
  </HeaderRow>
);
