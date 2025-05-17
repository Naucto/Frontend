import IEditor from "@modules/editor/IEditor";

import { TabbedComponent, TabbedComponentPage } from "@modules/editor/tab/TabbedComponent";
import React, { createContext, useContext } from "react";
import { WebrtcProvider } from "y-webrtc";
import * as Y from "yjs";
import config from "config.json";
import styled from "styled-components";
import { SpriteSheet } from "src/types/SpriteSheetType";
import { spriteTable } from "src/temporary/SpriteSheet";
import { palette } from "src/temporary/SpriteSheet";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { TabData } from "@modules/editor/tab/TabData";
import { EnvData } from "@shared/luaEnvManager/LuaEnvironmentManager";
import GameCanvas from "@shared/canvas/gameCanvas/GameCanvas";

const RightPanel = styled.div`
  height: 100vh;
  width: 50%;
  backgroundColor: rgb(83, 83, 83);
;`;

const Container = styled.div`
  backgroundColor: theme.colors.background;
  color: theme.colors.text;
  fontFamily: theme.typography.fontFamily;
  fontSize: theme.typography.fontSize;
  display: flex;
  flexDirection: column;
  height: 100vh;
`;

class EditorManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditorManagerError";
  }
}

type EditorComponent = React.ComponentClass<IEditor> & { new(): IEditor };

export class EditorManager {
  private editors: { component: EditorComponent; tabData: TabData }[] = [];

  private ydoc: Y.Doc | null = null;
  private provider: WebrtcProvider | null = null;

  // TEMPORARY FOR EXAMPLE PURPOSES
  // this will be deleted soon, when all data can be get (from server, yjs, etc)
  private canvasRef = React.createRef<SpriteRendererHandle>();

  private spriteSheet: SpriteSheet = {
    spriteSheet: spriteTable,
    spriteSize: {
      width: 8,
      height: 8
    },
    size: {
      width: 128,
      height: 128,
    },
    stride: 1
  };

  screenSize = {
    width: 320,
    height: 180
  };

  private envData: EnvData = {
    code: `function _init()
      set_col(7,10)
      x = 0
    end

    function _update()
      if (key_pressed("ArrowDown")) then
        x = x + 1
      end
      if (key_pressed("ArrowUp")) then
        x = x - 1
      end
      --if (key_pressed("ArrowLeft")) then
        --playSound(0)
      --end
    end

    function _draw()
      clear(3)
      sprite(0,x,0, 16, 16)
      --map(0,0,0,0,10,10)
    end`,
    output: "",
  };

  public setOutput = (newOutput: string): void => {
    this.envData.output = newOutput;
  };

  //

  public constructor() { }

  cleanUpAndDisconnect(): void {
    this.provider?.awareness.setLocalState(null);
    this.provider?.disconnect();
    this.ydoc?.destroy();
  }

  public init(room: string) {
    this.ydoc = new Y.Doc();
    this.provider = new WebrtcProvider(room, this.ydoc!, config.webrtc);

    this.editors.forEach((e) => {
      if (e.component.prototype instanceof IEditor) {
        e.component.prototype.init(this.ydoc!, this.provider!);
      }
    });
  }

  public addEditor(component: EditorComponent, tabData: TabData) {
    this.editors.push({ component, tabData });
  }

  public removeEditor(editor: IEditor) {
    const index = this.editors.findIndex(e => e.component === editor.constructor);
    if (index > -1) {
      this.editors.splice(index, 1);
    }
  }

  public getEditors(): IEditor[] {
    return this.editors.map(e => new e.component());
  }

  render() {
    return (
      <Container>
        <div className="editor"
          style={{
            width: "50%",
          }}>
          <TabbedComponent>
            {this.editors.map((editor, index) => {
              const EditorComponent = editor.component;
              return (
                <TabbedComponentPage key={index} title={editor.tabData.title}>
                  <EditorComponent ref={(instance: IEditor) => {
                    if (instance && this.ydoc && this.provider) {
                      instance.init(this.ydoc, this.provider);
                    }
                  }} />
                </TabbedComponentPage>
              );
            })}
          </TabbedComponent>
        </div>
        <RightPanel>
          <h1>right</h1>
          <GameCanvas
            ref={this.canvasRef}
            canvasProps={{
              screenSize: this.screenSize,
              spriteSheet: this.spriteSheet,
              palette: palette,
            }}
            envData={this.envData}
            setOutput={this.setOutput}
          />
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
    throw new EditorManagerError("useEditorManager must be used within an EditorManagerProvider");
  }
  return context;
};
