import React, { useEffect, useRef } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { editor } from "monaco-editor";
import CodeTabTheme from "./CodeTabTheme";
import { MonacoBinding } from "y-monaco";
import { EditorProps } from "./EditorType";
import "./CodeEditor.css";
import { useTheme } from "@mui/material/styles";

const CodeEditor: React.FC<EditorProps> = ({ ydoc, provider, onGetData, onSetData }) => {
  const monacoBindingRef = useRef<MonacoBinding | null>(null);
  const ytextRef = useRef<any | null>(null);
  const styleElementRef = useRef<HTMLStyleElement | null>(null);
  const theme = useTheme();

  const generateRandomColor = (): string => {
    const colors = [
      "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FECA57",
      "#FF9FF3", "#54A0FF", "#5F27CD", "#00D2D3", "#FF9F43",
      "#C44569", "#F8B500", "#6C5CE7", "#A29BFE", "#FD79A8"
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const updateUserStyles = () => {
    if (!provider?.awareness) return;

    const states = provider.awareness.getStates();
    let styles = "";

    states.forEach((state, clientId) => {
      if (state.user && clientId !== provider.awareness.clientID) {
        const { name, color } = state.user;
        const rgba = `${color}33`;

        styles += `
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
            transform: translateY(-5px) !important;
            transition: opacity 0.2s ease, transform 0.2s ease !important;
          }
          
          .yRemoteSelectionHead-${clientId}:hover::after {
            opacity: 1 !important;
            transform: translateY(5px) !important;
          }
        `;
      }
    });

    if (styleElementRef.current) {
      styleElementRef.current.textContent = styles;
    } else {
      const styleElement = document.createElement("style");
      styleElement.textContent = styles;
      document.head.appendChild(styleElement);
      styleElementRef.current = styleElement;
    }
  };

  useEffect(() => {
    if (!provider?.awareness) return;

    const handleAwarenessUpdate = () => {
      updateUserStyles();
    };

    const currentUser = provider.awareness.getLocalState()?.user;
    if (currentUser && !currentUser.color) {
      provider.awareness.setLocalStateField("user", {
        ...currentUser,
        color: generateRandomColor()
      });
    }

    provider.awareness.on("update", handleAwarenessUpdate);

    return () => {
      provider.awareness.off("update", handleAwarenessUpdate);
      if (styleElementRef.current) {
        document.head.removeChild(styleElementRef.current);
        styleElementRef.current = null;
      }
    };
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

    // Mettre à jour les styles après la liaison
    setTimeout(updateUserStyles, 100);

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
