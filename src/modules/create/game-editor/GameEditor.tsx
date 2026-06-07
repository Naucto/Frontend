import { workSessionControllerLeave } from "@api";
import CodeEditor from "@modules/create/game-editor/editors/CodeEditor";
import GameEditorConsole from "@modules/create/game-editor/editors/GameEditorConsole";
import { MapEditor } from "@modules/create/game-editor/editors/MapEditor/MapEditor";
import { MultiplayerSettingsEditor } from "@modules/create/game-editor/editors/multiplayer/MultiplayerSettingsEditor";
import ProjectSettingsEditor from "@modules/create/game-editor/editors/ProjectSettingsEditor";
import { SoundEditor } from "@modules/create/game-editor/editors/SoundEditor/SoundEditor";
import { SpriteEditor } from "@modules/create/game-editor/editors/SpriteEditor/SpriteEditor";
import { ProjectProvider, ProviderEventType } from "@providers/ProjectProvider";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { EnvData } from "@shared/luaEnvManager/LuaEnvironmentManager";

import { EditorContainer } from "./editors/EditorContainer";
import { EditorProps, EditorTab } from "./editors/EditorType";
import {
  DocIframe,
  GameEditorContainer,
  LeftPanel,
  PreviewCanvas,
  PreviewControls,
  PreviewToolbar,
  RightPanel,
  RightPanelSubcontainer,
  RunPreviewButton,
  StyledAlert,
  StyledDialog,
  StyledDialogActions,
  StyledDialogContent,
  StyledDialogTitle,
  StyledTab,
  TabContent,
} from "./GameEditor.styles";

import React, { useEffect, useMemo, useState } from "react";

import { MenuBook, PlayArrow, SportsEsports } from "@mui/icons-material";
import { Button, FormControlLabel, Switch, Tabs, Tooltip } from "@mui/material";
import { Beforeunload } from "react-beforeunload";

import CodeIcon from "@assets/code.svg?react";
import MapIcon from "@assets/map.svg?react";
import SoundIcon from "@assets/music.svg?react";
import SpriteIcon from "@assets/pen.svg?react";
import ProjectIcon from "@assets/project.svg?react";
import MultiplayerIcon from "@assets/user.svg?react";

interface GameEditorProps {
  project: ProjectProvider
}

const GameEditor: React.FC<GameEditorProps> = ({ project }: GameEditorProps) => {
  const [activeLeftPanelTab, setActiveLeftPanelTab] = useState(0);
  const [activeRightPanelTab, setActiveRightPanelTab] = useState(0);
  const [code, setCode] = useState("");
  const [output, setOutput] = useState<string>("");
  const [autoRefreshPreview, setAutoRefreshPreview] = useState(false);
  const [previewCode, setPreviewCode] = useState("");
  const [previewRevision, setPreviewRevision] = useState(0);

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

    const initialCode = project.codeProvider.getContent();
    setCode(initialCode);
    setPreviewCode(initialCode);

    const onCodeChange = (nextCode: string): void => {
      setCode(nextCode);
    };

    project.codeProvider.observe(onCodeChange);

    return () => {
      project.codeProvider.unobserve(onCodeChange);
    };
  }, [project]);

  //FIXME: temporary solution, should be replaced with given data from back

  const envData: EnvData = useMemo(() => ({
    code: previewCode,
    output,
  }), [output, previewCode]);

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

  const runPreview = (): void => {
    setOutput("");
    setPreviewCode(project.codeProvider.getContent());
    setPreviewRevision((value) => value + 1);
  };

  useEffect(() => {
    if (!autoRefreshPreview) {
      return;
    }

    setPreviewCode(code);
  }, [autoRefreshPreview, code]);

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
                ? <EditorContainer $disablePadding={tab.disablePadding}><EditorComponent project={project} consoleOutput={output} /></EditorContainer>
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
            <PreviewToolbar>
              <PreviewControls>
                <RunPreviewButton
                  variant="contained"
                  size="small"
                  startIcon={<PlayArrow />}
                  onClick={runPreview}
                  data-cy="run-preview"
                >
                  Play
                </RunPreviewButton>
                <Tooltip title="Refresh the preview whenever the code changes">
                  <FormControlLabel
                    sx={{ color: "white", m: 0 }}
                    control={
                      <Switch
                        checked={autoRefreshPreview}
                        onChange={(event) => setAutoRefreshPreview(event.target.checked)}
                        size="small"
                      />
                    }
                    label="Auto"
                  />
                </Tooltip>
              </PreviewControls>
            </PreviewToolbar>
            <PreviewCanvas
              key={previewRevision}
              ref={canvasRef}
              canvasProps={{
                map: project.mapProvider,
                screenSize: screenSize,
                sprite: project.spriteProvider,
                sound: project.soundProvider
              }}
              sx={{
                borderTopLeftRadius: 0
              }}
              envData={envData}
              setOutput={setOutput}
              soundProvider={project.soundProvider}
            />
          </TabContent>
          <TabContent
            role="tabpanel"
            className={activeRightPanelTab === 1 ? "active" : "hidden"}
            data-cy="doc-panel"
          >
            <DocIframe
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
