import React, { useEffect, useRef, useState } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import CodeTabTheme from "./CodeTabTheme";
import { MonacoBinding } from "y-monaco";
import { EditorProps } from "./EditorType";
import "./CodeEditor.css";
import { useTheme } from "@mui/material/styles";
import { generateRandomColor } from "@utils/colorUtils";

const CodeEditor: React.FC<EditorProps> = ({ ydoc, provider, onGetData, onSetData }) => {
  const monacoBindingRef = useRef<MonacoBinding | null>(null);
  const ytextRef = useRef<any | null>(null);
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

    const updateStyles = (changes?: { added: number[], updated: number[], removed: number[] }) => {
      const states = provider.awareness.getStates();
      const styleMap = new Map<number, string>();

      states.forEach((state, clientId) => {
        if (state?.user) {
          const { name, color } = state.user;
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

    const handleAwarenessUpdate = (changes: { added: number[], updated: number[], removed: number[] }) => {
      updateStyles(changes);
    };

    provider.awareness.on("change", handleAwarenessUpdate);

    return () => {
      provider.awareness.off("change", handleAwarenessUpdate);
    };
  }, [provider, generateUserStyles]);

  useEffect(() => {
    if (!provider?.awareness) return;

    const currentUser = provider.awareness.getLocalState()?.user;
    if (currentUser && !currentUser.color) {
      provider.awareness.setLocalStateField("user", {
        ...currentUser,
        color: generateRandomColor()
      });
    }
  }, [provider]);

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
            ytextRef.current.delete(0, ytextRef.current.length);
            ytextRef.current.insert(0, data);
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
