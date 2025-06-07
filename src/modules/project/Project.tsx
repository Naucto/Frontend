import Create from "@modules/create/Create";
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ProjectsService } from "src/api";
import { ProjectProvider, useProject } from "src/providers/ProjectProvider";
import GameEditor from "@modules/create/game-editor/GameEditor";

const Project: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<any>(null);

  useEffect(() => {
    const fetchProject = async (): Promise<void> => {
      if (projectId) {
        try {
          const project = await ProjectsService.projectControllerFindOne(parseInt(projectId));
          console.log("Project fetched:", project);
          setProject(project);
        } catch (error) {
          //FIXME: Handle error appropriately, e.g., show a notification
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
