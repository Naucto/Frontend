import { Box, Typography } from "@mui/material";;
import React from "react";
import Card from "@modules/projects/components/Card";
import { styled } from "@mui/material";
import { CreateProjectDto, ProjectsService } from "src/api";

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

  const createNewProject = async () => {
    const newProject: CreateProjectDto = {
      name: "Untitled Project",
      shortDesc: ""
    };
    try {
      const res = await ProjectsService.projectControllerCreate(newProject);
    } catch (error) {
      console.error("Error creating new project:", error);
      //FIXME: add error handling
    }
  };

  return (
    <DashedCard onClick={createNewProject}>
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center">
        <Typography fontWeight="regular">
          New project
        </Typography>
      </Box>
    </DashedCard>);
};

export default CreateProjectCard;
