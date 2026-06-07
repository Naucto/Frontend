import React, { useEffect, useState } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import CodeTabTheme from "./CodeTabTheme";
import { EditorProps } from "./EditorType";
import "./CodeEditor.css";
import { useTheme } from "@mui/material/styles";
import { generateRandomColor } from "@utils/colorUtils";
import { AwarenessEventType } from "@providers/editors/AwarenessProvider";
import {
  type AwarenessChanges,
  createRemoteUsersStyles,
} from "./code-editor/collaborationStyles";

const CodeEditor: React.FC<EditorProps> = ({ project }) => {
  const [userStyles, setUserStyles] = useState<string>("");
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

  const handleMount = (editor: editor.IStandaloneCodeEditor): (() => void) | void => {
    const editorModel = editor.getModel();
    if (!editorModel) {
      console.error("Monaco editor model is not available.");
      return;
    }

    project.codeProvider.setMonacoBinding(editor);

    return () => {
      editor.dispose();
    };
  };

  const handleBeforeMount = (monaco: Monaco): void => {
    monaco.editor.defineTheme(CodeTabTheme.MONACO_THEME_NAME, CodeTabTheme.MONACO_THEME);
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
        options={{ automaticLayout: true }}
      />
    </>
  );
};

export default CodeEditor;
