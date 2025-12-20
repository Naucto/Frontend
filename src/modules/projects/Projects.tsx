import React, { useEffect, useState } from "react";
import { styled } from "@mui/material";
import ProjectCard from "./components/ProjectCard";
import { ProjectResponseDto, ProjectsService } from "@api";
import CreateProjectCard from "@modules/projects/components/CreateProjectCard";
import { useAsync } from "src/hooks/useAsync";
import { useUser } from "@providers/UserProvider";
import { useNavigate } from "react-router-dom";
import * as urls from "@shared/route";

const PageContainer = styled("div")(({ theme }) => ({
  margin: theme.spacing(4),
}));

const Title = styled("h1")(({ theme }) => ({
  fontSize: "32px",
  color: theme.palette.text.primary,
  fontWeight: "normal",
  padding: theme.spacing(0, 0),
}));

const ProjectCardsContainer = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
}));

const Projects: React.FC = () => {
  const user = useUser();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<ProjectResponseDto[]>([]);

  const { value: fetchedProjects } = useAsync(
    ProjectsService.projectControllerFindAll,
    []
  );

  useEffect(() => {
    if (!user.user) {
      navigate(urls.toHub());
      return;
    }
    if (fetchedProjects) {
      setProjects(fetchedProjects);
    }
  }, [fetchedProjects, user.user]);

  return (
    <PageContainer>
      <Title>Projects</Title>
      <ProjectCardsContainer>
        <CreateProjectCard />
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </ProjectCardsContainer>
    </PageContainer>
  );
};

export default Projects;
