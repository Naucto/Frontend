import React, { useCallback, useEffect, useRef, useState } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import CodeTabTheme from "./CodeTabTheme";
import { EditorProps } from "./EditorType";
import "./CodeEditor.css";
import { useTheme } from "@mui/material/styles";
import { generateRandomColor } from "@utils/colorUtils";
import { AwarenessEventType } from "@providers/editors/AwarenessProvider";
import { getLuaErrorMarkers, LUA_MARKER_OWNER, registerLuaLanguageFeatures } from "./luaLanguageFeatures";
import {
  type AwarenessChanges,
  createRemoteUsersStyles,
} from "./code-editor/collaborationStyles";

const CodeEditor: React.FC<EditorProps> = ({ project, consoleOutput }) => {
  const [userStyles, setUserStyles] = useState<string>("");
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const theme = useTheme();
  const fontFamily = String(theme.typography.fontFamily ?? "sans-serif");

  useEffect(() => {
    if (!project?.awarenessProvider) return;

    const updateStyles = (changes?: AwarenessChanges): void => {
      const users = project.awarenessProvider.getUsers();
      setUserStyles(createRemoteUsersStyles(users, fontFamily, changes));
    };

    updateStyles();

    const handleAwarenessUpdate = (changes: AwarenessChanges): void => {
      updateStyles(changes);
    };

    project.awarenessProvider.observe(AwarenessEventType.CHANGE, handleAwarenessUpdate);

    return () => {
    };
  }, [fontFamily, project]);

  useEffect(() => {
    if (!project?.awarenessProvider) return;

    const currentUser = project.awarenessProvider.getLocalUser();

    if (currentUser && !currentUser.color) {
      project.awarenessProvider.setLocalUser({
        ...currentUser,
        color: generateRandomColor()
      });
    }
  }, [project]);

  const updateLuaErrorMarkers = useCallback((): void => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    const editorModel = editor?.getModel();
    if (!monaco || !editorModel) {
      return;
    }

    monaco.editor.setModelMarkers(
      editorModel,
      LUA_MARKER_OWNER,
      getLuaErrorMarkers(monaco, editorModel, consoleOutput)
    );
  }, [consoleOutput]);

  useEffect(() => {
    updateLuaErrorMarkers();
  }, [updateLuaErrorMarkers]);

  const handleMount = (
    mountedEditor: MonacoEditor.IStandaloneCodeEditor,
    monaco: Monaco,
  ): void => {
    editorRef.current = mountedEditor;
    monacoRef.current = monaco;
    const editorModel = mountedEditor.getModel();
    if (!editorModel) {
      console.error("Monaco editor model is not available.");
      return;
    }

    project.codeProvider.setMonacoBinding(mountedEditor);
    updateLuaErrorMarkers();
  };

  const handleBeforeMount = (monaco: Monaco): void => {
    monacoRef.current = monaco;
    monaco.editor.defineTheme(CodeTabTheme.MONACO_THEME_NAME, CodeTabTheme.MONACO_THEME);
    registerLuaLanguageFeatures(monaco);
  };

  return (
    <>
      {userStyles && <style>{userStyles}</style>}
      <Editor
        className="monaco"
        defaultLanguage="lua"
        theme={CodeTabTheme.MONACO_THEME_NAME}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        options={{
          automaticLayout: true,
          quickSuggestions: true,
          snippetSuggestions: "top",
          suggest: {
            preview: true,
            showWords: false,
          },
          tabCompletion: "on",
        }}
      />
    </>
  );
};

export default CodeEditor;
