import Create from "@modules/create/Create";
import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import { ProjectsService } from "src/api";
import { ProjectProvider, useProject } from "src/providers/ProjectProvider";

const Project: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { setProject } = useProject();

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
      <ProjectProvider>
        <Create />
      </ProjectProvider>
    </>
  );
};

export default Project;
