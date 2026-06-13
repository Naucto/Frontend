import { type GameProvider } from "@providers/GameProvider";
import GameCanvas from "@shared/canvas/game-canvas/GameCanvas";
import { type SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { type EnvData } from "@shared/lua-env-manager/LuaEnvironmentManager";

import { type Dispatch, type JSX, type RefObject, type SetStateAction } from "react";

import { CircularProgress, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";

import NextSvg from "@assets/next.svg";

type PlayableGameFrameProps = {
  bannerUrl: string;
  canvasRef: RefObject<SpriteRendererHandle | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  envData: EnvData;
  gameRefreshKey: number;
  gameProvider?: GameProvider;
  launching: boolean;
  screenSize: {
    width: number;
    height: number;
  };
  showGame: boolean;
  onLaunch: () => void;
  setOutput: Dispatch<SetStateAction<string>>;
};

const GameContainer = styled("div")(({ theme }) => ({
  width: "100%",
  aspectRatio: "16/9",
  backgroundColor: "rgba(8, 12, 20, 0.74)",
  marginBottom: theme.spacing(3),
  borderRadius: theme.shape.borderRadius,
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
}));

const PlayingCanvas = styled(GameCanvas)(() => ({
  width: "100%",
  height: "100%",
  objectFit: "contain",
}));

const LaunchScreenButton = styled("button", {
  shouldForwardProp: (prop) => prop !== "$src",
})<{ $src: string }>(({ theme, $src }) => ({
  width: "100%",
  height: "100%",
  border: "none",
  padding: 0,
  cursor: "pointer",
  position: "relative",
  overflow: "hidden",
  borderRadius: theme.shape.borderRadius,
  backgroundColor: "rgba(0, 0, 0, 0.42)",
  backgroundImage: $src ? `url(${$src})` : "none",
  backgroundSize: "cover",
  backgroundPosition: "center",
}));

const LaunchOverlay = styled("div")(({ theme }) => ({
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.58) 100%)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: theme.spacing(2),
}));

const LaunchIcon = styled("img")({
  width: "104px",
  height: "104px",
  imageRendering: "pixelated",
});

const LaunchLabel = styled(Typography)(({ theme }) => ({
  color: theme.palette.common.white,
  fontSize: "22px",
  fontWeight: 600,
  textShadow: "0 4px 18px rgba(0,0,0,0.55)",
}));

export const PlayableGameFrame = ({
  bannerUrl,
  canvasRef,
  containerRef,
  envData,
  gameRefreshKey,
  gameProvider,
  launching,
  screenSize,
  showGame,
  onLaunch,
  setOutput,
}: PlayableGameFrameProps): JSX.Element => (
  <GameContainer ref={containerRef}>
    {showGame && gameProvider ? (
      <PlayingCanvas
        key={gameRefreshKey}
        ref={canvasRef}
        canvasProps={{
          map: gameProvider.map,
          screenSize,
          sprite: gameProvider.sprite
        }}
        envData={envData}
        setOutput={setOutput}
        soundProvider={gameProvider.sound}
      />
    ) : (
      <LaunchScreenButton type="button" onClick={onLaunch} $src={bannerUrl}>
        <LaunchOverlay>
          {launching ? (
            <CircularProgress />
          ) : (
            <>
              <LaunchIcon src={NextSvg} alt="play" />
              <LaunchLabel>Click to play</LaunchLabel>
            </>
          )}
        </LaunchOverlay>
      </LaunchScreenButton>
    )}
  </GameContainer>
);
