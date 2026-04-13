import React, { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Tab, Tabs } from "@mui/material";
import { MenuBook, SportsEsports } from "@mui/icons-material";
import { styled } from "@mui/material/styles";
import { Beforeunload } from "react-beforeunload";

import { workSessionControllerLeave } from "@api";
import CodeEditor from "@modules/create/game-editor/editors/CodeEditor";
import GameEditorConsole from "@modules/create/game-editor/editors/GameEditorConsole";
import { MapEditor } from "@modules/create/game-editor/editors/MapEditor/MapEditor";
import ProjectSettingsEditor from "@modules/create/game-editor/editors/ProjectSettingsEditor";
import { SoundEditor } from "@modules/create/game-editor/editors/SoundEditor";
import { MultiplayerSettingsEditor } from "@modules/create/game-editor/editors/multiplayer/MultiplayerSettingsEditor.tsx";
import { SpriteEditor } from "@modules/editor/SpriteEditor/SpriteEditor";
import { ProjectProvider, ProviderEventType } from "@providers/ProjectProvider";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import GameCanvas from "@shared/canvas/gameCanvas/GameCanvas";
import { EnvData } from "@shared/luaEnvManager/LuaEnvironmentManager";
import CodeIcon from "src/assets/code.svg?react";
import MapIcon from "src/assets/map.svg?react";
import MultiplayerIcon from "src/assets/user.svg?react";
import ProjectIcon from "src/assets/project.svg?react";
import SoundIcon from "src/assets/music.svg?react";
import SpriteIcon from "src/assets/pen.svg?react";
import { EditorProps, EditorTab } from "./editors/EditorType";
import { EditorContainer } from "./editors/EditorContainer";

const GameEditorContainer = styled("div")(({ theme }) => ({
  height: "100%",
  display: "flex",
  flexDirection: "row",
  gap: theme.spacing(4),
  padding: `0 calc(${theme.spacing(4)} - 4px) calc(${theme.spacing(4)} - 4px)`,
  boxSizing: "border-box",
}));

const LeftPanel = styled("div")(() => ({
  width: "100%",
  display: "flex",
  flexDirection: "column",
}));

const RightPanel = styled("div")(({ theme }) => ({
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(4)
}));

const RightPanelSubcontainer = styled("div")(() => ({
  display: "flex",
  flexDirection: "column",
  height: "100%"
}));

const DocIframe = styled("iframe")(({ theme }) => ({
  width: "100%",
  height: "50vh",

  border: "none",
  borderRadius: theme.spacing(1),
  borderTopLeftRadius: 0,

  backgroundColor: theme.palette.blue[500],
}));

const TabContent = styled(Box)(() => ({
  flex: 1,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  "&.active": {
    display: "contents",
  },
  "&.hidden": {
    display: "none",
  },
}));

const StyledTab = styled(Tab)(({ theme }) => ({
  fontFamily: theme.typography.fontFamily,
  backgroundColor: theme.palette.blue[700],
  minHeight: theme.spacing(6),
  minWidth: theme.spacing(18),
  fontSize: "1.2rem",
  borderTopLeftRadius: theme.spacing(1),
  borderTopRightRadius: theme.spacing(1),
  color: "white",

  "&.Mui-selected, &.Mui-focusVisible": {
    backgroundColor: theme.palette.blue[500],
    color: "white"
  },
  "&:hover": {
    backgroundColor: theme.palette.blue[600],
  },
}));

const PreviewCanvas = styled(GameCanvas)(({ theme }) => ({
  borderRadius: theme.spacing(1)
}));

const StyledDialog = styled(Dialog)(({ theme }) => ({
  "& .MuiPaper-root": {
    backgroundColor: theme.palette.mode === "dark" ? theme.palette.grey[900] : "#0f0f0f",
    color: theme.palette.getContrastText(theme.palette.grey[900]),
    border: `1px solid ${theme.palette.grey[800]}`,
    boxShadow: theme.shadows[8],
  },
}));

const StyledDialogTitle = styled(DialogTitle)(() => ({
  color: "inherit",
}));

const StyledDialogContent = styled(DialogContent)(({ theme }) => ({
  backgroundColor: "transparent",
  borderColor: theme.palette.grey[800],
}));

const StyledDialogActions = styled(DialogActions)(() => ({
  backgroundColor: "transparent",
}));

const StyledAlert = styled(Alert)(({ theme }) => ({
  backgroundColor: "transparent",
  color: theme.palette.grey[100],
  borderColor: theme.palette.grey[700],
  "& .MuiAlert-icon": {
    color: theme.palette.grey[400],
  },
}));

interface GameEditorProps {
  project: ProjectProvider
}

const GameEditor: React.FC<GameEditorProps> = ({ project }: GameEditorProps) => {
  const [activeLeftPanelTab, setActiveLeftPanelTab] = useState(0);
  const [activeRightPanelTab, setActiveRightPanelTab] = useState(0);
  const [output, setOutput] = useState<string>("");

  const tabs = useMemo(() => [
    { label: "project", component: ProjectSettingsEditor, icon: <ProjectIcon/> },
    { label: "code", component: CodeEditor, icon: <CodeIcon/>, disablePadding: true },
    { label: "sprite", component: SpriteEditor, icon: <SpriteIcon/> },
    { label: "map", component: MapEditor, icon: <MapIcon/> },
    { label: "sound", component: SoundEditor, icon: <SoundIcon/> },
    { label: "multiplayer", component: MultiplayerSettingsEditor, icon: <MultiplayerIcon/> }
  ], []);

  const suppressBeforeUnloadRef = React.useRef(false);

  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [offlineWarningOpen, setOfflineWarningOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = async (): Promise<void> => {
      setIsOnline(true);
      suppressBeforeUnloadRef.current = true;
      project.saveContent();
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
    if (!project)
      return [];

    return tabs.map((tab) => {
      return {
        ...tab,
        label: tab.label,
        component: tab.component,
        icon: tab.icon
      };
    });
  }, [tabs, project]);

  useEffect(() => {
    if (!project)
      return;

    project.observe(ProviderEventType.BECOME_HOST, becomeHostListener);
    project.codeProvider.observe(setCode);
  }, [project]);

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
    if (!project) return;
    project.saveContent();

    workSessionControllerLeave({ path: { id: Number(project.projectId) } });

    project.destroy();
  };

  useEffect(() => {
    return () => {
      cleanUpAndDisconnect();
    };
  }, [editorTabs]);

  const canvasRef = React.useRef<SpriteRendererHandle>(null);

  const becomeHostListener = (): void => {
    setInterval(() => {
      project.saveContent();
    }, 5 * 60 * 1000);
  };

  const getAwarenessMessage = (): string => {
    const count = project.awarenessProvider.count();
    if (count > 1) {
      const otherUsers = count - 1;
      const userText = otherUsers === 1 ? "person is" : "people are";
      return `${otherUsers} other ${userText} in the session. Your local changes may be overwritten when you reconnect.`;
    }
    return "Your local changes may not synchronize until the connection is restored.";
  };

  if (!project)
    return <div>Loading work session...</div>; //FIXME: add a loading spinner with a component

  /*
   * FIXME: the TabContent should be refactored so that we only have to put
   *        true/false to indicate whether or not the tab is active
   */
  return (
    <GameEditorContainer>
      <LeftPanel>
        <Tabs
          value={activeLeftPanelTab}
          onChange={(_, newValue) => setActiveLeftPanelTab(newValue)}
          slotProps={{ indicator: { hidden: true } }}
        >
          {editorTabs.map(({ label, icon }) => (
            <StyledTab
              iconPosition="start"
              key={label}
              label={label}
              icon={icon}
              data-cy={`${label}-tab`}
            />
          ))}
        </Tabs>
        {editorTabs.map((tab, idx) => {
          const EditorComponent = tab.component as React.FC<EditorProps>;
          return (
            <TabContent
              key={tab.label}
              role="tabpanel"
              className={activeLeftPanelTab === idx ? "active" : "hidden"}
            >
              {EditorComponent
                ? <EditorContainer $disablePadding={tab.disablePadding}><EditorComponent project={project} /></EditorContainer>
                : <span>No editor available</span>}
            </TabContent>
          );
        })}
      </LeftPanel>

      <RightPanel>
        <RightPanelSubcontainer>
          <Tabs
            value={activeRightPanelTab}
            onChange={(_, newValue) => setActiveRightPanelTab(newValue)}
            slotProps={{ indicator: { hidden: true } }}
          >
            <StyledTab iconPosition="start" icon={<SportsEsports />} label="Preview" data-cy="display-tab" />
            <StyledTab iconPosition="start" icon={<MenuBook />} label="Doc" data-cy="doc-tab" />
          </Tabs>
          <TabContent
            role="tabpanel"
            className={activeRightPanelTab === 0 ? "active" : "hidden"}
            data-cy="preview-panel"
          >
            <PreviewCanvas
              ref={canvasRef}
              canvasProps={{
                map: project.mapProvider,
                screenSize: screenSize,
                sprite: project.spriteProvider,
                sound: project.sound
              }}
              sx={{
                borderTopLeftRadius: 0
              }}
              envData={envData}
              setOutput={setOutput}
              soundProvider={project.sound}
            />
          </TabContent>
          <TabContent
            role="tabpanel"
            className={activeRightPanelTab === 1 ? "active" : "hidden"}
            data-cy="doc-panel"
          >
            <DocIframe
              src={import.meta.env.VITE_DOCS_URL ?? "https://docs.naucto.net"}
              title="Naucto Documentation"
              data-cy="doc-iframe"
            />
          </TabContent>
        </RightPanelSubcontainer>

        <GameEditorConsole
          output={output} />
      </RightPanel>

      <StyledDialog
        open={!isOnline && offlineWarningOpen}
        onClose={() => setOfflineWarningOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <StyledDialogTitle>You are offline</StyledDialogTitle>
        <StyledDialogContent dividers>
          <StyledAlert
            severity={project.awarenessProvider.count() > 1 ? "warning" : "info"}
            variant="outlined"
          >
            {getAwarenessMessage()}
          </StyledAlert>
        </StyledDialogContent>
        <StyledDialogActions>
          <Button variant="contained" color="primary" onClick={() => setOfflineWarningOpen(false)} autoFocus>
            Got it
          </Button>
        </StyledDialogActions>
      </StyledDialog>

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
