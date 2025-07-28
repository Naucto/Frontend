import React, { useEffect, useRef } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import CodeTabTheme from "./CodeTabTheme";
import { MonacoBinding } from "y-monaco";
import * as Y from "yjs";
import { EditorProps } from "./EditorType";
import "./CodeEditor.css";

const CodeEditor: React.FC<EditorProps> = ({ ydoc, provider, onGetData, onSetData }) => {
  const monacoBindingRef = useRef<MonacoBinding | null>(null);
  const ytextRef = useRef<Y.Text | null>(null);

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

  useEffect(() => {
    if (onSetData) {
      onSetData((data: string) => {
        if (ytextRef.current && data) {
          ydoc.transact(() => {
            ytextRef.current?.delete(0, ytextRef.current?.length);
            ytextRef.current?.insert(0, data);
          });
        }
      });
    }
  }, [onSetData]);

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
