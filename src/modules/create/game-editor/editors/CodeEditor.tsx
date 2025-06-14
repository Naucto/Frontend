import React, { useRef, useEffect } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import CodeTabTheme from "@modules/editor/CodeEditor/CodeTabTheme.ts";
import { MonacoBinding } from "y-monaco";
import { EditorProps } from "./EditorType";

const CodeEditor: React.FC<EditorProps> = ({ ydoc, provider, onGetData }) => {
  const editorRef = useRef<any>(null);
  const ytextRef = useRef<any | null>(null);

  useEffect(() => {
    if (onGetData) {
      onGetData(() => {
        if (ytextRef.current) {
          return ytextRef.current.toString();
        }
        return "";
      });
    }
  }, [onGetData]);

  const handleMount = (editor: any) => {
    editorRef.current = editor;

    ytextRef.current = ydoc.getText("monaco");

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
      ytextRef.current,
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
