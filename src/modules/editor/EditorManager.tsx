import IEditor from "@modules/editor/IEditor"

import { TabbedComponent, TabbedComponentPage } from "@modules/editor/tab/TabbedComponent"
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { WebrtcProvider } from "y-webrtc";
import * as Y from "yjs"
import config from "config.json"
import styled from "styled-components";

const RightPanel = styled.div`
  height: 100vh;
  width: 50%;
  background-color: rgb(83, 83, 83);
;`

const Container = styled.div`
  backgroundColor: theme.colors.background;
  color: theme.colors.text;
  fontFamily: theme.typography.fontFamily;
  fontSize: theme.typography.fontSize;
  display: flex;
  flexDirection: column;
  height: 100vh;
`

export class EditorManager {
  private editors: IEditor[] = []

  public constructor() { }

  public init(room: string) {
    const ydoc = useMemo(() => new Y.Doc(), []);
    const [provider, setProvider] = useState<WebrtcProvider | null>(null);

    useEffect(() => {
      setProvider(new WebrtcProvider(room, ydoc, config.webrtc));

      return () => {
        provider?.disconnect();
        ydoc.destroy();
      }
    }, [ydoc]);

    this.editors.forEach(e => e.init(ydoc, provider!));
  }

  public addEditor(editor: IEditor) {
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
    return (
      <Container>
        <div className="editor"
          style={{
            width: "50%",
          }}>
          <TabbedComponent>
            {this.editors.map((editor, index) => (
              <TabbedComponentPage key={index} title={editor.tabData.title}>
                {editor.render()}
              </TabbedComponentPage>
            ))}
          </TabbedComponent>
        </div>
        <RightPanel>
          <h1>right</h1>
        </RightPanel>
      </Container>
    );
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