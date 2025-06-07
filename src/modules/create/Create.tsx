import { useEditorManager } from "@modules/editor/EditorManager";
import React, { useEffect } from "react";
import { WorkSessionsService } from "src/api/services/WorkSessionsService.ts";
import { useProject } from "src/providers/ProjectProvider";
import { useParams } from "react-router-dom";
import { ProjectsService } from "src/api";

const Create: React.FC = () => {
  const editorManager = useEditorManager();
  const [isInit, setIsInit] = React.useState(false);
  const { setProject, project } = useProject();
  const { projectId } = useParams<{ projectId: string }>();

  useEffect(() => {
    const fetchProject = async () => {
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

  useEffect(() => {
    // FIXME: This should be replaced with a proper project ID selection mechanism
    const projectId = parseInt(localStorage.getItem("projectId") || "1");
    WorkSessionsService.workSessionControllerJoin(projectId).then((session) => {
      editorManager.init(session.roomId || "1");
      setIsInit(true);
    }).catch((error) => {
      // FIXME: Handle error appropriately, e.g., show a notification
      console.error("Failed to join work session:", error);

      //FIXME: For now, we will just initialize with a default room ID...
      editorManager.init("1");
      setIsInit(true);
    });

    return () => {
      editorManager.cleanUpAndDisconnect();
    };
  }, [editorManager, setIsInit]);

  return (
    <div>
      {isInit && editorManager.render()}
    </div>
  );
};

export default Create;
