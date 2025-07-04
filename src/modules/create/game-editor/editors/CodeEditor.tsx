import React, { useRef } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import CodeTabTheme from "./CodeTabTheme";
import { MonacoBinding } from "y-monaco";
import { EditorProps } from "./EditorType";
import "./CodeEditor.css";

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
