import React, { useEffect, useRef } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import CodeTabTheme from "./CodeTabTheme";
import { MonacoBinding } from "y-monaco";
import { EditorProps } from "./EditorType";
import "./CodeEditor.css";

const CodeEditor: React.FC<EditorProps> = ({ ydoc, provider, data, setData }) => {
  const monacoBindingRef = useRef<MonacoBinding | null>(null);
  const ytextRef = useRef<any | null>(null);

  useEffect(() => {
    if (!ydoc || !provider) {
      console.error("YDoc or provider is not available.");
      return;
    }
    if (ytextRef.current) {
      ydoc.transact(() => {
        ytextRef.current.delete(0, ytextRef.current.length);
        ytextRef.current.insert(0, data);
      });
    }
    return () => {
      ytextRef.current = null;
      if (monacoBindingRef.current) {
        monacoBindingRef.current.destroy();
        monacoBindingRef.current = null;
      }
    };
  }, [ydoc, provider, data, setData]);

  const handleMount = (editor: editor.IStandaloneCodeEditor): (() => void) | void => {
    const editorModel = editor.getModel();
    if (!editorModel) {
      console.error("Monaco editor model is not available.");
      return;
    }

    ytextRef.current = ydoc.getText("monaco");

    monacoBindingRef.current = new MonacoBinding(
      ytextRef.current,
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
