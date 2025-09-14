import React, { useEffect, useMemo, useState } from "react";
import { styled } from "@mui/material/styles";
import { Tabs, Tab, Box, Dialog, DialogTitle, DialogContent, DialogActions, Button, Alert } from "@mui/material";
import CodeEditor from "@modules/create/game-editor/editors/CodeEditor";
import { EditorProps, EditorTab } from "./editors/EditorType";
import { SoundEditor } from "./editors/SoundEditor";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import GameCanvas from "@shared/canvas/gameCanvas/GameCanvas";
import { EnvData } from "@shared/luaEnvManager/LuaEnvironmentManager";
import { WorkSessionsService } from "@api";
import { Beforeunload } from "react-beforeunload";
import { SpriteEditor } from "@modules/editor/SpriteEditor/SpriteEditor";
import { MapEditor } from "@modules/create/game-editor/editors/MapEditor";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import GameEditorConsole from "@modules/create/game-editor/editors/GameEditorConsole";
import CodeIcon from "src/assets/code.svg?react";
import SpriteIcon from "src/assets/pen.svg?react";
import SoundIcon from "src/assets/music.svg?react";
import MapIcon from "src/assets/map.svg?react";
import { useProject } from "src/providers/ProjectProvider";
import { EngineProvider, ProviderEventType } from "src/providers/EngineProvider.ts";

const GameEditorContainer = styled("div")(({ theme }) => ({
  height: "100%",
  display: "flex",
  flexDirection: "row",
  margin: theme.spacing(1),
  gap: theme.spacing(4),
}));

const LeftPanel = styled("div")(() => ({
  width: "100%",
  display: "flex",
  flexDirection: "column",
}));

const RightPanel = styled("div")(({ theme }) => ({
  width: "80%",
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(4),
}));

const TabContent = styled(Box)({
  flex: 1,
  overflow: "auto",
});

const StyledTab = styled(Tab)(({ theme }) => ({
  fontFamily: theme.typography.fontFamily,
  backgroundColor: theme.palette.blue[500],
  minHeight: theme.spacing(6),
  minWidth: theme.spacing(18),
  fontSize: "1.2rem",
  borderTopLeftRadius: theme.spacing(1),
  borderTopRightRadius: theme.spacing(1),
  color: "white",
  "&.Mui-selected, &.Mui-focusVisible": {
    backgroundColor: theme.palette.blue[700],
    color: "white"
  },
  "&:hover": {
    backgroundColor: theme.palette.blue[400],
  },
}));

const PreviewCanvas = styled(GameCanvas)(({ theme }) => ({
  borderRadius: theme.spacing(1)
}));

const GameEditor: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [output, setOutput] = useState<string>("");
  const [provider] = useState<EngineProvider>(new EngineProvider());

  const { project } = useProject();

  const tabs = useMemo(() => [
    { label: "code", component: CodeEditor, icon: <CodeIcon /> },
    { label: "sprite", component: SpriteEditor, icon: <SpriteIcon /> },
    { label: "map", component: MapEditor, icon: <MapIcon /> },
    { label: "sound", component: SoundEditor, icon: <SoundIcon /> },
  ], []);

  const suppressBeforeUnloadRef = React.useRef(false);

  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [offlineWarningOpen, setOfflineWarningOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = async (): Promise<void> => {
      setIsOnline(true);
      suppressBeforeUnloadRef.current = true;
      provider.saveContent();
      window.location.reload();
    };
    const handleOffline = (): void => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline) setOfflineWarningOpen(true);
  }, [isOnline]);

  const editorTabs: EditorTab[] = useMemo(() => {
    if (!provider)
      return [];

    return tabs.map((tab) => {
      const EditorComponent: Maybe<React.FC<EditorProps>> = tab.component;

      return {
        ...tab,
        label: tab.label,
        component: EditorComponent ? (
          <EditorComponent
            key={tab.label}
            provider={provider}
          />
        ) : (
          <span key={tab.label}>No editor available</span>
        )
      };
    });
  }, [tabs, provider]);

  useEffect(() => {
    if (!provider)
      return;

    provider.observe(ProviderEventType.BECOME_HOST, becomeHostListener);
    provider.code.observe(setCode);
  }, [provider]);

  const [code, setCode] = useState("");

  //FIXME: temporary solution, should be replaced with given data from back

  const envData: EnvData = useMemo(() => ({
    code,
    output,
  }), [code, output]);

  const screenSize = useMemo(() => ({
    width: 320,
    height: 180,
  }), []);

  //ENDFIXME

  const cleanUpAndDisconnect = (): void => {
    if (!provider) return;
    provider.saveContent();
    const projectId = LocalStorageManager.getProjectId();

    WorkSessionsService.workSessionControllerLeave(Number(projectId));

    provider.quit();
  };

  useEffect(() => {
    return () => {
      cleanUpAndDisconnect();
    };
  }, [editorTabs]);

  const canvasRef = React.useRef<SpriteRendererHandle>(null);

  const becomeHostListener = (): void => {
    setInterval(() => {
      provider.saveContent();
    }, 5 * 60 * 1000);
  };

  if (!provider)
    return <div>Loading work session...</div>; //FIXME: add a loading spinner with a component

  return (
    <GameEditorContainer>
      <LeftPanel>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          slotProps={{ indicator: { hidden: true } }}
        >
          {editorTabs.map(({ label, icon }) => (
            <StyledTab
              iconPosition="start"
              key={label}
              label={label}
              icon={icon} />
          ))}
        </Tabs>
        {editorTabs.map((tab, idx) => (
          <TabContent
            key={tab.label}
            role="tabpanel"
            hidden={activeTab !== idx}
            sx={{ display: activeTab === idx ? "block" : "none" }}
          >
            {tab.component}
          </TabContent>
        ))}
      </LeftPanel>
      <RightPanel>
        {project && (
          <PreviewCanvas
            ref={canvasRef}
            canvasProps={{
              map: project.map,
              screenSize,
              spriteSheet: project.spriteSheet,
              palette: project.palette,
            }}
            envData={envData}
            setOutput={setOutput}
          />
        )}
        <GameEditorConsole output={output} />
      </RightPanel>

      <Dialog
        open={!isOnline && offlineWarningOpen}
        onClose={() => setOfflineWarningOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: (theme) => ({
              bgcolor: theme.palette.mode === "dark" ? theme.palette.grey[900] : "#0f0f0f",
              color: theme.palette.getContrastText(theme.palette.grey[900]),
              border: `1px solid ${theme.palette.grey[800]}`,
              boxShadow: theme.shadows[8],
            }),
          },
        }}
      >
        <DialogTitle sx={{ color: "inherit" }}>You are offline</DialogTitle>
        <DialogContent
          dividers
          sx={(theme) => ({
            bgcolor: "transparent",
            borderColor: theme.palette.grey[800],
          })}
        >
          <Alert
            severity={provider.awareness.count() > 1 ? "warning" : "info"}
            variant="outlined"
            sx={(theme) => ({
              bgcolor: "transparent",
              color: theme.palette.grey[100],
              borderColor: theme.palette.grey[700],
              "& .MuiAlert-icon": { color: theme.palette.grey[400] },
            })}
          >
            {provider.awareness.count() > 1
              ? `${provider.awareness.count()} other ${provider.awareness.count() === 2 ? "person is" : "people are"} in the session. Your local changes may be overwritten when you reconnect.`
              : "Your local changes may not synchronize until the connection is restored."}
          </Alert>
        </DialogContent>
        <DialogActions sx={{ bgcolor: "transparent" }}>
          <Button variant="contained" color="primary" onClick={() => setOfflineWarningOpen(false)} autoFocus>
            Got it
          </Button>
        </DialogActions>
      </Dialog>

      <Beforeunload onBeforeunload={(event) => {
        if (suppressBeforeUnloadRef.current) {
          return undefined;
        }
        event.preventDefault();
        cleanUpAndDisconnect();
        return "Are you sure you want to leave? Your changes may not be saved.";
      }} />
    </GameEditorContainer>
  );
};

export default GameEditor;
