import React, { useEffect, useMemo, useRef, useState } from "react";
import { styled } from "@mui/material/styles";
import { Tabs, Tab, Box, Button } from "@mui/material";
import CodeEditor from "@modules/create/game-editor/editors/CodeEditor";
import { WebrtcProvider } from "y-webrtc";
import * as Y from "yjs";
import config from "config.json";
import { EditorProps, EditorTab } from "./editors/EditorType";
import { SoundEditor } from "./editors/SoundEditor";
import { palette, spriteTable } from "src/temporary/SpriteSheet";
import { SpriteSheet } from "src/types/SpriteSheetType";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import GameCanvas from "@shared/canvas/gameCanvas/GameCanvas";
import { EnvData } from "@shared/luaEnvManager/LuaEnvironmentManager";
import { ApiError, ProjectsService, WorkSessionsService } from "@api";
import { Beforeunload } from "react-beforeunload";
import { SpriteEditor } from "@modules/editor/SpriteEditor/SpriteEditor";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import GameEditorConsole from "@modules/create/game-editor/editors/GameEditorConsole";
import CodeIcon from "src/assets/code.svg?react";
import SpriteIcon from "src/assets/pen.svg?react";
import SoundIcon from "src/assets/music.svg?react";
import MapIcon from "src/assets/map.svg?react";

const GameEditorContainer = styled("div")(({ theme }) => ({
  height: "100%",
  display: "flex",
  flexDirection: "row",
  margin: theme.spacing(1),
  gap: theme.spacing(4),
}));

const LeftPanel = styled("div")(({ theme }) => ({
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

type UserState = { name: string; color: string; userId: string };
const PreviewCanvas = styled(GameCanvas)(({ theme }) => ({
  borderRadius: theme.spacing(1)
}));

const GameEditor: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [output, setOutput] = useState<string>("");
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const [projectContent, setProjectContent] = useState<any>(null); // FIXME: change typing
  const [isHost, setIsHost] = useState<boolean>(false);

  const getDataFunctions = useRef<{ [key: string]: () => string }>({});
  const setDataFunctions = useRef<{ [key: string]: (data: string) => void }>({});

  const tabs = useMemo(() => [
    { label: "code", component: CodeEditor, icon: <CodeIcon /> },
    { label: "sprite", component: SpriteEditor, icon: <SpriteIcon /> },
    { label: "map", component: undefined, icon: <MapIcon /> },
    { label: "sound", component: SoundEditor, icon: <SoundIcon /> },
  ], []);

  const ydoc: Y.Doc = useMemo(() => new Y.Doc(), []);

  useEffect(() => {
    const joinSession = async () => {
      try {
        const projectId = LocalStorageManager.getProjectId();
        const session = await WorkSessionsService.workSessionControllerJoin(projectId);
        setRoomId(session.roomId);

        const host = (await WorkSessionsService.workSessionControllerGetInfo(projectId)).host;
        const userId = LocalStorageManager.getUserId();
        if (host === userId) {
          setIsHost(true);

          try {
            const content = await ProjectsService.projectControllerFetchProjectContent(String(projectId));
            setProjectContent(content);
          } catch (error: any) {
            if (error instanceof ApiError && error.status === 404) {
              setProjectContent({});
            } else {
              console.error("Failed to fetch project content:", error); // FIXME : better error handling
            }
          }
        }
      } catch (err) {
        console.error("Failed to join work session:", err); // FIXME : better error handling
      }
    };

    joinSession();
  }, []);

  const provider: WebrtcProvider | undefined = useMemo(() => {
    if (!roomId)
      return undefined;
    return new WebrtcProvider(roomId, ydoc, config.webrtc);
  }, [roomId, ydoc]);

  const awareness = useMemo(() => {
    if (!provider)
      return undefined;
    return provider.awareness;
  }, [provider]);

  const editorTabs: EditorTab[] = useMemo(() => {
    if (!ydoc || !provider) return [];

    return tabs.map((tab) => {
      const EditorComponent: React.FC<EditorProps> | undefined = tab.component;

      const handleGetData = (getData: () => string) => {
        getDataFunctions.current[tab.label] = getData;
      };

      const handleSetData = (setData: (data: string) => void) => {
        setDataFunctions.current[tab.label] = setData;
      };

      return {
        ...tab,
        label: tab.label,
        component: EditorComponent ? (
          <EditorComponent
            key={tab.label}
            ydoc={ydoc}
            provider={provider}
            onGetData={handleGetData}
            onSetData={handleSetData}
          />
        ) : (
          <span key={tab.label}>No editor available</span>
        ),
        getData: () => getDataFunctions.current[tab.label]?.() || "",
        setData: (data: string) => setDataFunctions.current[tab.label]?.(data)
      };
    });
  }, [tabs, ydoc, provider]);

  useEffect(() => {
    if (projectContent && editorTabs.length > 0) {
      editorTabs.forEach(({ label, setData }) => {
        if (setData && projectContent[label]) {
          setData(projectContent[label]);
        }
      });
    }
  }, [projectContent, editorTabs]);

  useEffect(() => {
    const userName = LocalStorageManager.getUserName();
    const userId = LocalStorageManager.getUserId();
    awareness?.setLocalStateField("user", {
      name: userName,
      color: "#abcdef", // FIXME: use a proper color from each user settings
      userId: userId,
    });

    const userStateCache = new Map<number, UserState>();

    const onChange = ({ added, updated, removed }: {
      added: number[]
      updated: number[]
      removed: number[]
    }) => {
      [...added, ...updated].forEach(clientID => {
        const state = awareness?.getStates().get(clientID);
        if (state?.user) {
          userStateCache.set(clientID, state.user);
        }
      });

      removed.forEach(clientID => {
        const disconnectedUser = userStateCache.get(clientID);
        if (disconnectedUser) {
          const projectId = Number(LocalStorageManager.getProjectId());
          WorkSessionsService
            .workSessionControllerGetInfo(projectId)
            .then(sessionInfo => {
              if (sessionInfo.host === userId) {
                setIsHost(true);
              }
            });
          userStateCache.delete(clientID);

          WorkSessionsService.workSessionControllerKick(projectId, { userId: Number(disconnectedUser.userId) });
        }
      });
    };

    if (!awareness)
      return;

    awareness!.on("change", onChange);
    return () => awareness!.off("change", onChange);
  }, [awareness]);

  const [code, setCode] = useState("");

  useEffect(() => {
    const ytext = ydoc.getText("monaco");
    setCode(ytext.toString());
    const handler = (): void => setCode(ytext.toString());
    ytext.observe(handler);
    return () => ytext.unobserve(handler);
  }, [ydoc]);

  //FIXME: temporary solution, should be replaced with given data from back

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

  //ENDFIXME

  const saveProjectContent = () => {
    const jsonData: { [key: string]: string } = {};
    editorTabs.forEach(({ label, getData }) => {
      if (getData) {
        const content = getData();
        jsonData[label] = content;
      }
    });

    if (!jsonData || Object.keys(jsonData).length === 0)
      return;

    ProjectsService.projectControllerSaveProjectContent(
      String(LocalStorageManager.getProjectId()),
      { file: new Blob([JSON.stringify(jsonData)], { type: "application/json" }) }
    ).catch((error) => {
      console.error("Failed to save content:", error);
    });
  };

  const cleanUpAndDisconnect = () => {
    if (!provider || !ydoc || editorTabs.length === 0)
      return;

    saveProjectContent();
    const projectId = LocalStorageManager.getProjectId();

    WorkSessionsService.workSessionControllerLeave(Number(projectId));

    provider?.awareness.setLocalState(null);
    provider?.disconnect();
    ydoc?.destroy();
  };

  useEffect(() => {
    return () => {
      cleanUpAndDisconnect();
    };
  }, [editorTabs]);

  const canvasRef = React.useRef<SpriteRendererHandle>(null);

  useEffect(() => {
    if (!isHost)
      return;

    const intervalId = setInterval(() => {
      saveProjectContent();
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [editorTabs, isHost]);

  if (!provider)
    return <div>Loading work session...</div>;

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
        <TabContent>{editorTabs[activeTab]?.component}</TabContent>
      </LeftPanel>
      <RightPanel>
        <PreviewCanvas
          ref={canvasRef}
          canvasProps={{
            screenSize,
            spriteSheet,
            palette,
          }}
          envData={envData}
          setOutput={setOutput}
        />
        <GameEditorConsole output={output} />
      </RightPanel>
      <Beforeunload onBeforeunload={(event) => {
        event.preventDefault();
        cleanUpAndDisconnect();
        return "Are you sure you want to leave? Your changes may not be saved.";
      }} />
    </GameEditorContainer>
  );
};

export default GameEditor;
