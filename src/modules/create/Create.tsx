import { useEditorManager } from "@modules/editor/EditorManager";
import React, { useEffect } from "react";
import { WorkSessionsService } from "src/api/services/WorkSessionsService.ts";

const Create: React.FC = () => {
  const editorManager = useEditorManager();
  const [isInit, setIsInit] = React.useState(false);
  useEffect(() => {
    const projectId = parseInt(localStorage.getItem("projectId") || "1");
    WorkSessionsService.workSessionControllerJoin(projectId).then((session) => {
      console.log(session);
      editorManager.init(session.roomId || "test");
      setIsInit(true);
    }).catch((error) => {
      console.error("Failed to join work session:", error);
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
