import React, { useRef } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import CodeTabTheme from "./CodeTabTheme";
import { MonacoBinding } from "y-monaco";
import { EditorProps } from "./EditorType";

const CodeEditor: React.FC<EditorProps> = ({ ydoc, provider }) => {
  const monacoBindingRef = useRef<MonacoBinding | null>(null);

  const handleMount = (editor: editor.IStandaloneCodeEditor): (() => void) | void => {
    const editorModel = editor.getModel();
    if (!editorModel) {
      console.error("Monaco editor model is not available.");
      return;
    }

    monacoBindingRef.current = new MonacoBinding(
      ydoc.getText("monaco"),
      editorModel,
      new Set([editor]),
      provider.awareness
    );

    return () => {
      editor.dispose();
      monacoBindingRef.current?.destroy?.();
    };
  };

  const handleBeforeMount = (monaco: Monaco): void => {
    monaco.editor.defineTheme(CodeTabTheme.MONACO_THEME_NAME, CodeTabTheme.MONACO_THEME);
  };

  return (
    <>
      <style>{`
        .yRemoteSelection { 
          background-color: rgba(250, 129, 0, 0.5); 
        }
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
        }
      `}</style>
      <Editor
        className="monaco"
        defaultLanguage="lua"
        theme={CodeTabTheme.MONACO_THEME_NAME}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        options={{ automaticLayout: true }}
        defaultValue="//test"
      />
    </>
  );
};

export default CodeEditor;
