import IEditor from "@modules/editor/IEditor"

import { useTheme } from "@theme/ThemeContext"
import { TabbedComponent, TabbedComponentPage } from "@modules/editor/tab/TabbedComponent"
import React, { createContext, useContext, useMemo } from "react";
import { WebrtcProvider } from "y-webrtc";
import * as Y from "yjs"
import config from "config.json"

export class EditorManager {
  private provider: WebrtcProvider;
  private editors: IEditor[] = []
  private ydoc: Y.Doc = useMemo(() => new Y.Doc(), []);

  public constructor() { }

  public init() {
    this.provider = new WebrtcProvider("your-room-name", this.ydoc, config.webrtc);

    this.editors.forEach(e => e.init())
  }

  public addEditor(editor: IEditor) {
    console.log("EditorManager addEditor", editor.tabData.title)
    const index = this.editors.indexOf(editor)
    if (index > -1) {
      this.editors.splice(index, 1)
    }
    this.editors.push(editor)
  }

  public removeEditor(editor: IEditor) {
    const index = this.editors.indexOf(editor)
    if (index > -1) {
      this.editors.splice(index, 1)
    }
  }

  public getEditors(): IEditor[] {
    return this.editors
  }

  render() {
    const theme = useTheme();
    return (
      <div
        style={{
          backgroundColor: theme.colors.background,
          color: theme.colors.text,
          fontFamily: theme.typography.fontFamily,
          fontSize: theme.typography.fontSize,
        }}
      >
        <div className="editor">
          <TabbedComponent>
            {this.editors.map((editor, index) => (
              <TabbedComponentPage key={index} title={editor.tabData.title}>
                {editor.render()}
              </TabbedComponentPage>
            ))}
          </TabbedComponent>
        </div>
      </div>
    )
  }
}


const EditorManagerContext = createContext<EditorManager | null>(null);

interface EditorManagerProviderProps {
  value: EditorManager;
  children: React.ReactNode;
}

export const EditorManagerProvider = ({ value, children }: EditorManagerProviderProps) => {
  return (
    <EditorManagerContext.Provider value={value}>
      {children}
    </EditorManagerContext.Provider>
  );
};



export const useEditorManager = (): EditorManager => {
  const context = useContext(EditorManagerContext);
  if (!context) {
    throw new Error("useEditorManager must be used within an EditorManagerProvider");
  }
  return context;
};


