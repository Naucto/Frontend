import { useEditorManager } from "@modules/editor/EditorManager";
import React from "react";


const Create: React.FC = () => {
  const editorManager = useEditorManager();
  console.log(editorManager)
  return (
    <div />
  );
};

export default Create;