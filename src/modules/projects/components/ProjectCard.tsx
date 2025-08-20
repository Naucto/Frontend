import { Typography } from "@mui/material";
import React from "react";
import { styled } from "@mui/material";
import { useNavigate } from "react-router-dom";
import Card from "@modules/projects/components/Card";
import * as urls from "@shared/route";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import { ProjectResponseDto } from "@api";

type ProjectCardProps = {
  project: ProjectResponseDto
}

const Text = styled(Typography)(({ theme }) => ({
  fontSize: "16px",
  color: theme.palette.text.primary,
  fontWeight: "normal",
  padding: theme.spacing(0, 0),
}));

const StyledCard = styled(Card)<{ src: string}>(({ src }) => ({
  backgroundImage: `url(${src})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
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
  const navigate = useNavigate();
  const redirectToProject = (): void => {
    navigate(urls.toProject(project.id));
    LocalStorageManager.setProjectId(project.id);
  };

  let thumbnailUrl = "";
  if (typeof project.iconUrl === "string") {
    thumbnailUrl = project.iconUrl;
  }

  return (
    <StyledCard onClick={redirectToProject} src={thumbnailUrl}>
      <ProjectFooter>
        <Text variant="h6">{project.name}</Text>
      </ProjectFooter>
    </StyledCard>
  );
};

export default ProjectCard;
