import React, { useRef } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import CodeTabTheme from "@modules/editor/CodeEditor/CodeTabTheme.ts";
import { MonacoBinding } from "y-monaco";
import { EditorProps } from "./EditorType";

const CodeEditor: React.FC<EditorProps> = ({ ydoc, provider }) => {
  const editorRef = useRef<any>(null);

  const handleMount = (editor: any) => {
    editorRef.current = editor;

    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
      .yRemoteSelection { background-color: rgba(250, 129, 0, 0.5); }
      .yRemoteSelectionHead {
          position: absolute;
          border-left: orange solid 2px;
          border-top: orange solid 2px;
          border-bottom: orange solid 2px;
          height: 100%;
          box-sizing: border-box;
        }
      .yRemoteSelectionHead::after {
          position: absolute;
          content: ' ';
          border: 3px solid orange;
          border-radius: 4px;
          left: -4px;
          top: -5px;
      };`;
    document.head.appendChild(styleSheet);

    new MonacoBinding(
      ydoc.getText("monaco"),
      editor.getModel(),
      new Set([editor]),
      provider.awareness
    );

    return () => {
      editor.dispose();
      document.head.removeChild(styleSheet);
    };
  };

  const handleBeforeMount = (monaco: Monaco) => {
    monaco.editor.defineTheme(CodeTabTheme.MONACO_THEME_NAME, CodeTabTheme.MONACO_THEME);
  };

  return (
    <Editor
      className="monaco"
      defaultLanguage="lua"
      theme={CodeTabTheme.MONACO_THEME_NAME}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      options={{ automaticLayout: true }}
      defaultValue="//test"
    />
  );
};

export default CodeEditor;
