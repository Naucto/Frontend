import { useEditorManager } from "@modules/editor/EditorManager";
import React, { useEffect } from "react";

const Create: React.FC = () => {
  const editorManager = useEditorManager();

  useEffect(() => {
    editorManager.init("test");

    return () => {
      editorManager.cleanUpAndDisconnect();
    };
  }, [editorManager]);

  return (
    <div>
      {editorManager.render()}
    </div>
  );
};

export default Create;
