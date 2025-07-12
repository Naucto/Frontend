import { useEditorManager } from "@modules/editor/EditorManager";
import React, { useEffect } from "react";
import { WorkSessionsService } from "src/api/services/WorkSessionsService.ts";
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
      //FIXME: For now, we will just initialize with a default room id, because backend needs to be on to test it
      editorManager.init("1");
      setIsInit(true);
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

