import React, { useEffect, useMemo } from "react";
import { styled } from "@mui/material/styles";
import { Tabs, Tab, Box } from "@mui/material";
import CodeEditor from "@modules/create/game-editor/editors/CodeEditor";
import { WebrtcProvider } from "y-webrtc";
import * as Y from "yjs";
import config from "config.json";
import { EditorProps } from "./editors/EditorType";
import { SoundEditor } from "./editors/SoundEditor";
import StyledCanvas from "@shared/canvas/Canvas";
import { palette, spriteTable } from "src/temporary/SpriteSheet";
import { SpriteSheet } from "src/types/SpriteSheetType";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import GameCanvas from "@shared/canvas/gameCanvas/GameCanvas";
import { EnvData } from "@shared/luaEnvManager/LuaEnvironmentManager";

const GameEditorContainer = styled("div")({
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "row",
});

const LeftPanel = styled("div")({
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
});

const RightPanel = styled("div")({
  width: "100%",
  height: "100%",
  backgroundColor: "gray",
});

const TabContent = styled(Box)({
  flex: 1,
  overflow: "auto",
  backgroundColor: "white",
});

const StyledTab = styled(Tab)(({ theme }) => ({
  fontFamily: theme.typography.fontFamily, // FIXME: use correct theme when available
  backgroundColor: theme.palette.primary.main,
  padding: "0.3rem 2rem",
  fontSize: "1.2rem",
  borderTopLeftRadius: theme.shape.borderRadius,
  borderTopRightRadius: theme.shape.borderRadius,
  color: "white",
  opacity: 1,
  "&.Mui-selected": {
    backgroundColor: theme.palette.primary.dark,
  },
  "&:hover": {
    backgroundColor: theme.palette.primary.light,
  },
}));

const GameEditor: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState(0);
  const [output, setOutput] = React.useState<string>("");
  const tabs = React.useMemo(() => [
    { label: "code", component: CodeEditor },
    { label: "map", component: undefined },
    { label: "sound", component: SoundEditor },
    { label: "sprite", component: undefined },
  ], []);

  // FIXME: make a correct way to get the Y.Doc instances Louis Théodore
  const ydocs: Y.Doc[] = React.useMemo(() => {
    return tabs.map(() => new Y.Doc());
  }, []);

  const providers: WebrtcProvider[] = React.useMemo(() => {
    return ydocs.map((doc, index) => {
      return new WebrtcProvider(`game-editor-${index}`, doc, config.webrtc);
    });
  }, [ydocs]);

  const editorTabs = React.useMemo(
    () => {
      if (ydocs.length === 0 || providers.length === 0) {
        return [];
      }
      const editorTabs = tabs.map((tab, index) => {
        //FIXME: don't forget to remove undefined when all components are implemented

        const EditorComponent: React.FC<EditorProps | undefined> = tab.component;
        if (!EditorComponent) {
          return {
            label: tab.label,
            component: <span key={tab.label}>No editor available</span>,
          };
        }

        //END_FIXME

        return {
          label: tab.label,
          component: (
            <EditorComponent
              ydoc={ydocs[index]}
              provider={providers[index]}
            />
          ),
        };
      });
      return editorTabs;
    },
    [ydocs, providers]
  );

  const [code, setCode] = React.useState("");

  // make a listener to update the code when the Y.Doc changes)
  useEffect(() => {
    const ytext = ydocs[0].getText("monaco");
    setCode(ytext.toString());
    const handler = (): void => setCode(ytext.toString());
    ytext.observe(handler);
    return () => { ytext.unobserve(handler); };
  }, [ydocs]);

  const envData: EnvData = React.useMemo(() => {
    return {
      code: code,
      output: output,
    };
  }, [code, output]);

  //FIXME: get spritesheet, palette, and canvas size from the game configuration
  const spriteSheet: SpriteSheet = useMemo(() => ({
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
  }), []);

  const screenSize = useMemo(() => ({
    width: 320,
    height: 180
  }), []);

  const canvasRef = React.useRef<SpriteRendererHandle>(null);
  // FIXME: for demonstration purposes, remove when the game configuration is implemented
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.clear(0);
      canvas.setColor(1, 2);
      canvas.setColor(2, 3);
      canvas.setColor(3, 1);
      canvas.queueSpriteDraw(0, 0, 0, 16, 16);
      canvas.draw();
    }
  }, [canvasRef]);

  return (
    <GameEditorContainer>
      <LeftPanel>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          variant="fullWidth"
        >
          {editorTabs.map(({ label }) => (
            <StyledTab key={label} label={label} />
          ))}
        </Tabs>
        <TabContent>{editorTabs[activeTab].component}</TabContent>
      </LeftPanel>
      <RightPanel>
        <GameCanvas
          ref={canvasRef}
          canvasProps={{
            screenSize: screenSize,
            spriteSheet: spriteSheet,
            palette: palette,
          }}
          envData={envData}
          setOutput={setOutput}
        />
      </RightPanel>
    </GameEditorContainer>
  );
};

export default GameEditor;
