import Card from "@modules/projects/components/Card";
import { useCreateProject } from "@modules/projects/hooks/useCreateProject";

import React from "react";

import { Box, Typography } from "@mui/material";
import { styled } from "@mui/material";

const DashedCard = styled(Card)(({ theme }) => ({
  border: "4px dashed",
  borderColor: theme.palette.gray[400],
  backgroundColor: theme.palette.gray[900],
  color: theme.palette.text.primary,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "none",
  cursor: "pointer",
}));

const CreateProjectCard: React.FC = () => {
  const { createProject, isCreatingProject } = useCreateProject();

  return (
    <DashedCard onClick={() => void createProject()} disabled={isCreatingProject}>
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center">
        <Typography fontWeight="regular">
          {isCreatingProject ? "Creating..." : "New project"}
        </Typography>
      </Box>
    </DashedCard>);
};

export default CreateProjectCard;
