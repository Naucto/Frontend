import IEditor from "@modules/editor/IEditor"

import { useTheme } from "@theme/ThemeContext"
import { TabbedComponent, TabbedComponentPage } from "@modules/editor/tab/TabbedComponent"
import React, { createContext, useContext, useRef } from "react";

import { TabData } from "@modules/editor/tab/TabData";

type EditorComponent = React.ComponentType<any>;

export class EditorManager  {

  public constructor() { }

  private editors: { component: EditorComponent; tabData: TabData }[] = [];
  private activeEditorIndex: number = 0;

  public addEditor(component: EditorComponent, tabData: TabData) {
   
    this.editors.push({ component, tabData });

  }

  public removeEditor(index: number) {
    if (index < 0 || index >= this.editors.length) {
      throw new Error("Index out of bounds");
    }
    this.editors.splice(index, 1);
  }

  public getEditors() {
    return this.editors
  }

  renderActiveEditor() {
    const { component: Editor } = this.editors[this.activeEditorIndex];
    return <Editor />; // React will handle rendering
  }

  render() {
    const theme = useTheme(); // You can use `useTheme()` inside a functional component, but we need to adjust this since this method is in a class-based component.

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
            {this.editors.map((editor, index) => {
              const EditorComponent = editor.component;
              return (
                <TabbedComponentPage key={index} title={editor.tabData.title}>
                  <EditorComponent />
                </TabbedComponentPage>
              );
            })}
          </TabbedComponent>
        </div>
      </div>
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


