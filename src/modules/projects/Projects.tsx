import React, { useCallback, useEffect, useState } from "react";
import { styled } from "@mui/material";
import ProjectCard from "./components/ProjectCard";
import { ProjectsService, UpdateProjectDto } from "src/api";
import CreateProjectCard from "@modules/projects/components/CreateProjectCard";

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
  display: "flex",
  flexDirection: "row",
  flexWrap: "wrap",
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
}));

const Projects: React.FC = () => {

  //FIXME: update the type when the API is ready
  const [projects, setProjects] = useState<any>([]);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const fetchedProjects = await ProjectsService.projectControllerFindAll();
        setProjects(fetchedProjects);
      } catch (error) {
        //FIXME: add error handling
        console.error("Error fetching projects:", error);
      }
    };
    fetchProjects();
  }, []);

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
