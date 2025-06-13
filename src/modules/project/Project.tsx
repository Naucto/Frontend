import Create from "@modules/create/Create";
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ProjectsService } from "src/api";
import { ProjectProvider } from "src/providers/ProjectProvider";
import GameEditor from "@modules/create/game-editor/GameEditor";

const Project: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<any>(null); //FIXME: define the type project when api ready

  useEffect(() => {
    const fetchProject = async (): Promise<void> => {
      if (projectId) {
        try {
          const project = await ProjectsService.projectControllerFindOne(parseInt(projectId));
          setProject(project);
        } catch (error) {
          //FIXME: create a toast notification for error handling
          console.error("Failed to fetch project:", error);
        }
      }
    };
    fetchProject();
  }, [projectId, setProject]);
  return (
    <>
      <ProjectProvider project={project} setProject={setProject}>
        <GameEditor />
      </ProjectProvider>
    </>
  );
};

export default Project;
