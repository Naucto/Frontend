import { useEditorManager } from "@modules/editor/EditorManager";
import React, { useEffect } from "react";
import { WorkSessionsService } from "@api/services/WorkSessionsService.ts";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import { useProject } from "../../providers/ProjectProvider";

const Create: React.FC = () => {
  const editorManager = useEditorManager();
  const [isInit, setIsInit] = React.useState(false);
  const { project } = useProject();
  useEffect(() => {
    // FIXME: This should be replaced with a proper project ID selection mechanism
    const projectId = LocalStorageManager.getProjectId();
    WorkSessionsService.workSessionControllerJoin(projectId).then((session) => {
      editorManager.init(session.roomId || "1");
      setIsInit(true);
    }).catch((error) => {
      // FIXME: Handle error appropriately, e.g., show a notification
      console.error("Failed to join work session:", error);
    });
    return () => {
      editorManager.cleanUpAndDisconnect();
    };
  }, [editorManager, setIsInit, project]);

  return (
    <div>
      {isInit && editorManager.render()}
    </div>
  );
};

export default Create;

