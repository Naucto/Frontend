import React, { useEffect, useMemo, useState } from "react";
import { styled } from "@mui/material/styles";
import { Tabs, Tab, Box } from "@mui/material";
import CodeEditor from "@modules/create/game-editor/editors/CodeEditor";
import { WebrtcProvider } from "y-webrtc";
import * as Y from "yjs";
import config from "config.json";
import { EditorProps } from "./editors/EditorType";
import { SoundEditor } from "./editors/SoundEditor";
import { palette, spriteTable } from "src/temporary/SpriteSheet";
import { SpriteSheet } from "src/types/SpriteSheetType";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import GameCanvas from "@shared/canvas/gameCanvas/GameCanvas";
import { EnvData } from "@shared/luaEnvManager/LuaEnvironmentManager";
import { WorkSessionsService } from "../../../api";

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
  fontFamily: theme.typography.fontFamily,
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
  const [activeTab, setActiveTab] = useState(0);
  const [output, setOutput] = useState<string>("");
  const [roomId, setRoomId] = useState<string | null>(null);

  const tabs = useMemo(() => [
    { label: "code", component: CodeEditor },
    { label: "map", component: undefined },
    { label: "sound", component: SoundEditor },
    { label: "sprite", component: undefined },
  ], []);

  const ydoc: Y.Doc = useMemo(() => new Y.Doc(), []);

  useEffect(() => {
    const joinSession = async () => {
      try {
        const projectId = parseInt(localStorage.getItem("projectId") || "1");
        const session = await WorkSessionsService.workSessionControllerJoin(projectId);
        setRoomId(session.roomId);
      } catch (err) {
        console.error("Failed to join work session:", err);
      }
    };

    joinSession();
  }, []);

  const provider: WebrtcProvider | null = useMemo(() => {
    if (!roomId) return null;
    return new WebrtcProvider(roomId, ydoc, config.webrtc);
  }, [roomId, ydoc]);

  const editorTabs = useMemo(() => {
    if (!ydoc || !provider) return [];

    return tabs.map((tab) => {
      const EditorComponent: React.FC<EditorProps> | undefined = tab.component;
      return {
        label: tab.label,
        component: EditorComponent ? (
          <EditorComponent key={tab.label} ydoc={ydoc} provider={provider} />
        ) : (
          <span key={tab.label}>No editor available</span>
        ),
      };
    });
  }, [tabs, ydoc, provider]);

  const [code, setCode] = useState("");

  useEffect(() => {
    const ytext = ydoc.getText("monaco");
    setCode(ytext.toString());
    const handler = () => setCode(ytext.toString());
    ytext.observe(handler);
    return () => ytext.unobserve(handler);
  }, [ydoc]);

  const envData: EnvData = useMemo(() => ({
    code,
    output,
  }), [code, output]);

  const spriteSheet: SpriteSheet = useMemo(() => ({
    spriteSheet: spriteTable,
    spriteSize: { width: 8, height: 8 },
    size: { width: 128, height: 128 },
    stride: 1,
  }), []);

  const screenSize = useMemo(() => ({
    width: 320,
    height: 180,
  }), []);

  const canvasRef = React.useRef<SpriteRendererHandle>(null);

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

  if (!provider) return <div>Loading work session...</div>;

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
        <TabContent>{editorTabs[activeTab]?.component}</TabContent>
      </LeftPanel>
      <RightPanel>
        <GameCanvas
          ref={canvasRef}
          canvasProps={{
            screenSize,
            spriteSheet,
            palette,
          }}
          envData={envData}
          setOutput={setOutput}
        />
      </RightPanel>
    </GameEditorContainer>
  );
};

export default GameEditor;
