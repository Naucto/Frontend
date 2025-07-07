import React, { useEffect, useMemo, useRef, useState } from "react";
import { styled } from "@mui/material/styles";
import { Tabs, Tab, Box } from "@mui/material";
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
import { ProjectsService, WorkSessionsService } from "../../../api";
import { Beforeunload } from "react-beforeunload";
import { SpriteEditor } from "@modules/editor/SpriteEditor/SpriteEditor";

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
});

const TabContent = styled(Box)({
  flex: 1,
  overflow: "auto",
});

const StyledTab = styled(Tab)(({ theme }) => ({
  fontFamily: theme.typography.fontFamily,
  backgroundColor: theme.palette.primary.main, //FIXME: use blue color from theme
  padding: theme.spacing(1, 2),
  fontSize: "1.2rem",
  borderTopLeftRadius: theme.shape.borderRadius,
  borderTopRightRadius: theme.shape.borderRadius,
  color: "white",
  "&.Mui-selected": {
    backgroundColor: theme.palette.primary.dark, //FIXME: use blue color from theme
  },
  "&:hover": {
    backgroundColor: theme.palette.primary.light, //FIXME: use blue color from theme
  },
}));

type UserState = { name: string; color: string; userId: string };

const GameEditor: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [output, setOutput] = useState<string>("");
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const [projectContent, setProjectContent] = useState<any>(null);
  const [isHost, setIsHost] = useState<boolean>(false);

  const getDataFunctions = useRef<{ [key: string]: () => string }>({});
  const setDataFunctions = useRef<{ [key: string]: (data: string) => void }>({});

  const tabs = useMemo(() => [
    { label: "code", component: CodeEditor },
    { label: "map", component: undefined },
    { label: "sound", component: SoundEditor },
    { label: "sprite", component: SpriteEditor },
  ], []);

  const ydoc: Y.Doc = useMemo(() => new Y.Doc(), []);

  useEffect(() => {
    const joinSession = async () => {
      try {
        const projectId = localStorage.getItem("projectId") || "1";
        const session = await WorkSessionsService.workSessionControllerJoin(parseInt(projectId));
        setRoomId(session.roomId);

        const host = (await WorkSessionsService.workSessionControllerGetInfo(Number(projectId))).host;
        const userId = JSON.parse(localStorage.getItem("user") ?? "{}").id;
        if (host == userId) {
          const content = await ProjectsService.projectControllerFetchProjectContent(projectId);
          setIsHost(true);
          setProjectContent(content);
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
    const user = JSON.parse(localStorage.getItem("user") ?? "{}");
    awareness?.setLocalStateField("user", {
      name: user.name,
      color: "#abcdef", // FIXME: use a proper color from each user settings
      userId: user.id,
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
          const projectId = Number(localStorage.getItem("projectId") || "1");
          WorkSessionsService
            .workSessionControllerGetInfo(projectId)
            .then(sessionInfo => {
              if (sessionInfo.host == user.id) {
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
      localStorage.getItem("projectId") || "1",
      { file: new Blob([JSON.stringify(jsonData)], { type: "application/json" }) }
    ).catch((error) => {
      console.error("Failed to save content:", error);
    });
  };

  const cleanUpAndDisconnect = () => {
    if (!provider || !ydoc || editorTabs.length === 0)
      return;

    saveProjectContent();
    const projectId = localStorage.getItem("projectId") || "1";

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
      {
        <Beforeunload onBeforeunload={(event) => {
          event.preventDefault();
          cleanUpAndDisconnect();
          return "Are you sure you want to leave? Your changes may not be saved.";
        }} />
      }
    </GameEditorContainer>
  );
};

export default GameEditor;
