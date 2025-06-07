import { Button, Typography } from "@mui/material";
import React from "react";
import { UpdateProjectDto } from "src/api";
import { styled } from "@mui/material";
import { useNavigate } from "react-router-dom";
import Card from "@modules/projects/components/Card";

//FIXME: update the type when the API is ready
//TODO
type ProjectCardProps = any;

const Text = styled(Typography)(({ theme }) => ({
  fontSize: "16px",
  color: theme.palette.text.primary,
  fontWeight: "normal",
  padding: theme.spacing(0, 0),
}));

const ProjectFooter = styled("div")(({ theme }) => ({
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",

  padding: theme.spacing(1, 1.5),
  backgroundColor: theme.palette.gray[900],
  borderBottomLeftRadius: theme.custom.rounded.md,
  borderBottomRightRadius: theme.custom.rounded.md,
}));

const ProjectCard: React.FC<ProjectCardProps> = ({ project }) => {
  console.log("ProjectCard props:", project);
  const navigate = useNavigate();
  const redirectToProject = (): void => {
    navigate("/projects/" + project.id);
  };

  return (
    <Card onClick={redirectToProject}>
      <ProjectFooter>
        <Text variant="h6">{project.name}</Text>
      </ProjectFooter>
    </Card>
  );
};

export default ProjectCard;
