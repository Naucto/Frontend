import React, { useEffect, useState } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import CodeTabTheme from "./CodeTabTheme";
import { EditorProps } from "./EditorType";
import "./CodeEditor.css";
import { useTheme } from "@mui/material/styles";
import { generateRandomColor } from "@utils/colorUtils";
import { AwarenessEventType } from "../../../../providers/editors/AwarenessProvider";

const CodeEditor: React.FC<EditorProps> = ({ project }) => {
  const [userStyles, setUserStyles] = useState<string>("");
  const theme = useTheme();

  const generateUserStyles = (clientId: number, name: string, color: string): string => {
    const rgba = `${color}33`;

    return `
      .yRemoteSelection-${clientId} {
        background-color: ${rgba} !important;
      }
      
      .yRemoteSelectionHead-${clientId} {
        border-left: ${color} solid 2px !important;
        border-top: ${color} solid 2px !important;
        border-bottom: ${color} solid 2px !important;
      }
      
      .yRemoteSelectionHead-${clientId}::before {
        content: '' !important;
        position: absolute !important;
        top: -15px !important;
        left: -15px !important;
        width: 50px !important;
        height: 35px !important;
        z-index: 999 !important;
        background: transparent !important;
        border: 10px solid transparent !important;
      }
      
      .yRemoteSelectionHead-${clientId}::after {
        border: 3px solid ${color} !important;
        content: '${name}' !important;
        background-color: ${color} !important;
        color: white !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        font-size: 12px !important;
        font-weight: bold !important;
        font-family: ${theme.typography.fontFamily} !important;
        white-space: nowrap !important;
        position: absolute !important;
        top: -25px !important;
        left: -4px !important;
        z-index: 1000 !important;
        opacity: 0 !important;
        transform: translateY(10px) !important;
        transition: opacity 0.2s ease, transform 0.2s ease !important;
      }
      
      .yRemoteSelectionHead-${clientId}:hover::after {
        opacity: 1 !important;
        transform: translateY(0px) !important;
      }
    `;
  };

  useEffect(() => {
    if (!project?.awareness) return;

    const updateStyles = (changes?: { added: number[], updated: number[], removed: number[] }): void => {
      const users = project.awareness.getUsers();
      const styleMap = new Map<number, string>();

      users.forEach((user) => styleMap.set(user.clientId, generateUserStyles(user.clientId, user.name, user.color)));

      if (changes) {
        changes.removed.forEach((clientId) => {
          styleMap.delete(clientId);
        });
      }

      setUserStyles(Array.from(styleMap.values()).join("\n"));
    };

    updateStyles();

    const handleAwarenessUpdate = (changes: { added: number[], updated: number[], removed: number[] }): void => {
      updateStyles(changes);
    };

    project.awareness.observe(AwarenessEventType.CHANGE, handleAwarenessUpdate);

    return () => {
    };
  }, [project, generateUserStyles]);

  useEffect(() => {
    if (!project?.awareness) return;

    const currentUser = project.awareness.getLocalUser();

    if (currentUser && !currentUser.color) {
      project.awareness.setLocalUser({
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

    project.code.setMonacoBinding(editor);

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
        defaultValue=""
      />
    </>
  );
};

export default CodeEditor;
