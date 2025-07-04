import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ProjectResponseDto, ProjectsService } from "src/api";
import { ProjectProvider } from "src/providers/ProjectProvider";
import GameEditor from "@modules/create/game-editor/GameEditor";
import { Project as ProjectType } from "../../types/ProjectType";
import { useAsync } from "src/hooks/useAsync";

const Project: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectType | undefined>(undefined);

  const { value } = useAsync<ProjectResponseDto | undefined>(async () => {
    if (projectId) {
      const project: ProjectResponseDto = await ProjectsService.projectControllerFindOne(parseInt(projectId));
      return project;
    }
    return undefined;
  }, [projectId]);

  useEffect(() => {
    if (value) {
      setProject(value);
    }
  }, [value]);

  return (
    <>
      <ProjectProvider project={project} setProject={setProject}>
        <GameEditor />
      </ProjectProvider>
    </>
  );
};

export default Project;
