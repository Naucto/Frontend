import { useEditorManager } from "@modules/editor/EditorManager";
import React, { useEffect } from "react";

const Create: React.FC = () => {
  const editorManager = useEditorManager();
  const [isInit, setIsInit] = React.useState(false);
  useEffect(() => {
    editorManager.init("test");
    setIsInit(true);
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
