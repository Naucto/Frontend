import React, { useEffect, useState } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import CodeTabTheme from "./CodeTabTheme";
import { EditorProps } from "./EditorType";
import "./CodeEditor.css";
import { useTheme } from "@mui/material/styles";
import { generateRandomColor } from "@utils/colorUtils";
import { AwarenessEventType } from "../../../../providers/editors/AwarenessProvider";
import { EngineUser } from "src/types/userTypes";

const CodeEditor: React.FC<EditorProps> = ({ provider }) => {
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
    if (!provider?.awareness) return;

    const updateStyles = (changes?: { added: number[], updated: number[], removed: number[] }): void => {
      const states = provider.awareness.getStates();
      const styleMap = new Map<number, string>();

      states.forEach((state, clientId) => {
        if (state && typeof state === "object" && "user" in state) {
          const { name, color } = (state as { user: EngineUser }).user;
          styleMap.set(clientId, generateUserStyles(clientId, name, color));
        }
      });

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

    provider.awareness.observe(AwarenessEventType.CHANGE, handleAwarenessUpdate);

    return () => {
    };
  }, [provider, generateUserStyles]);

  useEffect(() => {
    if (!provider?.awareness) return;

    const currentUser = provider.awareness.getLocalUser();

    if (currentUser && !currentUser.color) {
      provider.awareness.setLocalUser({
        ...currentUser,
        color: generateRandomColor()
      });
    }
  }, [provider]);

  const handleMount = (editor: editor.IStandaloneCodeEditor): (() => void) | void => {
    const editorModel = editor.getModel();
    if (!editorModel) {
      console.error("Monaco editor model is not available.");
      return;
    }

    provider.code.setMonacoBinding(editor);

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
        defaultValue="//test"
      />
    </>
  );
};

export default CodeEditor;
