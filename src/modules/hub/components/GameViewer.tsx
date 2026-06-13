import {
  projectControllerFork,
  projectControllerGetLikeStatus,
  projectControllerGetPublishedProjectImage,
  projectControllerGetRelease,
  projectControllerLikeProject,
  projectControllerRegisterReleaseView,
  ProjectExResponseDto,
} from "@api";
import { GameProvider, ProviderEventType } from "@providers/GameProvider";
import { useUser } from "@providers/UserProvider";
import { type SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { type EnvData } from "@shared/lua-env-manager/LuaEnvironmentManager";
import * as urls from "@shared/navigation/routes";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import { getCachedProjectImageUrl } from "@utils/projectImageCache";

import CommentSection from "./CommentSection";
import {
  type ForkedFromInfo,
  GameDetailsPanel,
} from "./game-viewer/GameDetailsPanel";
import {
  GameTitle,
  GameViewerLayout,
  LoadingGameViewer,
  MissingProjectViewer,
} from "./game-viewer/GameViewerLayout";
import { PlayableGameFrame } from "./game-viewer/PlayableGameFrame";

import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";

import RefreshIcon from "@mui/icons-material/Refresh";
import { Box, Button } from "@mui/material";
import { alpha, styled } from "@mui/material/styles";
import { useSnackbar } from "notistack";
import { useLocation, useNavigate, useParams } from "react-router-dom";

const HeaderBar = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: theme.spacing(2),
  marginBottom: theme.spacing(2),
  paddingRight: theme.spacing(7),
  [theme.breakpoints.down("sm")]: {
    gridTemplateColumns: "1fr",
    paddingRight: theme.spacing(6),
  },
}));

const HeaderActions = styled(Box)(({ theme }) => ({
  justifySelf: "end",
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1),
  [theme.breakpoints.down("sm")]: {
    justifySelf: "center",
  },
}));

const RefreshGameButton = styled(Button)(({ theme }) => ({
  color: theme.palette.common.white,
  borderColor: alpha(theme.palette.common.white, 0.24),
  backgroundColor: alpha(theme.palette.gray[900], 0.38),
  "&:hover": {
    borderColor: alpha(theme.palette.common.white, 0.42),
    backgroundColor: alpha(theme.palette.gray[900], 0.56),
  },
}));

export const GameViewer = (): JSX.Element => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUser();
  const { enqueueSnackbar } = useSnackbar();
  const [launching, setLaunching] = useState(false);
  const [project, setProject] = useState<ProjectExResponseDto | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [forking, setForking] = useState(false);
  const [forkedFromInfo, setForkedFromInfo] = useState<ForkedFromInfo | null>(null);
  const canvasRef = useRef<SpriteRendererHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [gameProvider, setGameProvider] = useState<GameProvider>();
  const [showGame, setShowGame] = useState(false);
  const [gameRefreshKey, setGameRefreshKey] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [viewCount, setViewCount] = useState(0);
  const [forkCount, setForkCount] = useState(0);

  const screenSize = useMemo(() => ({
    width: 320,
    height: 180,
  }), []);

  const envData: EnvData = useMemo(() => ({
    code,
    output,
  }), [code, output]);

  const focusGameCanvas = useCallback((): void => {
    canvasRef.current?.getCanvas?.()?.focus();
  }, []);

  useEffect(() => {
    const fetchProjectData = async (): Promise<void> => {
      if (!id) {
        return;
      }

      setLoading(true);
      setProject(undefined);
      setForkedFromInfo(null);

      try {
        const { data: projectDetails } = await projectControllerGetRelease({ path: { id } });
        const proj = projectDetails as ProjectExResponseDto;
        setProject(proj);
        setLikeCount(proj?.likes ?? 0);
        setViewCount(proj?.viewCount ?? 0);
        setForkCount(proj?.forkCount ?? 0);

        const imageUrl = await getCachedProjectImageUrl(
          "published",
          Number(id),
          async () => {
            const imageResponse = await projectControllerGetPublishedProjectImage({ path: { id: Number(id) } });
            return imageResponse.status !== 204 && imageResponse.status !== 404 && imageResponse.data?.url
              ? imageResponse.data.url
              : null;
          },
          proj.iconUrl,
        );
        setBannerUrl(imageUrl);

        const { data: viewData } = await projectControllerRegisterReleaseView({ path: { id } });
        if (viewData) {
          setViewCount(viewData.viewCount);
          window.dispatchEvent(new CustomEvent("project-stats-updated", {
            detail: {
              projectId: Number(id),
              changes: { viewCount: viewData.viewCount },
            },
          }));
        }

        LocalStorageManager.addPlayedProject(Number(id));
        window.dispatchEvent(new Event("played-history-updated"));

        if (user) {
          try {
            const { data: likeData } = await projectControllerGetLikeStatus({ path: { id } });
            if (likeData) {
              setLiked(likeData.liked);
            }
          } catch {
            // Like status should not block opening a published game.
          }
        } else {
          setLiked(LocalStorageManager.isProjectLiked(Number(id)));
        }

        if (proj?.forkedFromId) {
          try {
            const { data: sourceProject } = await projectControllerGetRelease({
              path: { id: String(proj.forkedFromId) },
            });
            const source = sourceProject as ProjectExResponseDto | undefined;
            if (source) {
              setForkedFromInfo({
                id: source.id,
                name: source.name,
                creator: source.creator ?? null,
              });
            }
          } catch {
            setForkedFromInfo(null);
          }
        }
      } catch (error) {
        console.error("Error loading project:", error);
        enqueueSnackbar("Failed to load project", { variant: "error" });
      } finally {
        setLoading(false);
      }
    };

    void fetchProjectData();
  }, [enqueueSnackbar, id, user]);

  useEffect(() => () => {
    gameProvider?.destroy();
  }, [gameProvider]);

  useEffect(() => {
    if (!showGame) {
      return;
    }

    const frame = window.requestAnimationFrame(focusGameCanvas);
    focusGameCanvas();

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [focusGameCanvas, showGame, gameRefreshKey]);

  const handleLaunchGame = (): void => {
    if (!id || showGame || launching) {
      return;
    }

    setLaunching(true);
    const provider = new GameProvider(Number(id));
    setGameProvider(provider);

    provider.observe(ProviderEventType.INITIALIZED, () => {
      setCode(String(provider.code || ""));
      setShowGame(true);
      setGameRefreshKey((value) => value + 1);
      setLaunching(false);
    });
  };

  const handleRefreshGame = (): void => {
    if (!showGame) {
      return;
    }

    setOutput("");
    setGameRefreshKey((value) => value + 1);
    window.requestAnimationFrame(focusGameCanvas);
  };

  const handleClose = (): void => {
    if ((location.state as { backgroundLocation?: unknown } | null)?.backgroundLocation) {
      navigate(-1);
      return;
    }
    navigate(urls.toHub());
  };

  const handleLike = async (): Promise<void> => {
    if (!id) {
      return;
    }

    try {
      const { data } = await projectControllerLikeProject({ path: { id } });
      if (data) {
        setLiked(data.liked);
        setLikeCount(data.likes);
        window.dispatchEvent(new CustomEvent("project-stats-updated", {
          detail: {
            projectId: Number(id),
            changes: { likes: data.likes },
          },
        }));
      }

      if (!user) {
        if (data?.liked) {
          LocalStorageManager.addLikedProject(Number(id));
        } else {
          LocalStorageManager.removeLikedProject(Number(id));
        }
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  };

  const handleFork = async (): Promise<void> => {
    if (!id || forking) {
      return;
    }

    setForking(true);
    try {
      const { data: forkedProject } = await projectControllerFork({ path: { id: Number(id) } });
      if (forkedProject) {
        const nextForkCount = forkCount + 1;
        setForkCount(nextForkCount);
        setProject((current) => (current ? { ...current, forkCount: nextForkCount } : current));
        window.dispatchEvent(new CustomEvent("project-stats-updated", {
          detail: {
            projectId: Number(id),
            changes: { forkCount: nextForkCount },
          },
        }));
        enqueueSnackbar("Project forked successfully!", { variant: "success" });
        navigate(urls.toProject(forkedProject.id));
      }
    } catch (error) {
      console.error("Error forking project:", error);
      enqueueSnackbar("Failed to fork project", { variant: "error" });
    } finally {
      setForking(false);
    }
  };

  if (loading) {
    return <LoadingGameViewer />;
  }

  if (!project) {
    return <MissingProjectViewer onClose={handleClose} />;
  }

  return (
    <GameViewerLayout onClose={handleClose}>
      <HeaderBar>
        <Box />
        <GameTitle variant="h3">{project.name}</GameTitle>
        <HeaderActions>
          {showGame ? (
            <RefreshGameButton
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={handleRefreshGame}
            >
              Refresh game
            </RefreshGameButton>
          ) : null}
        </HeaderActions>
      </HeaderBar>

      <PlayableGameFrame
        bannerUrl={bannerUrl}
        canvasRef={canvasRef}
        containerRef={containerRef}
        envData={envData}
        gameProvider={gameProvider}
        gameRefreshKey={gameRefreshKey}
        launching={launching}
        screenSize={screenSize}
        showGame={showGame}
        onLaunch={handleLaunchGame}
        setOutput={setOutput}
      />

      <GameDetailsPanel
        canFork={!!user}
        forkCount={forkCount}
        forkedFromInfo={forkedFromInfo}
        forking={forking}
        likeCount={likeCount}
        liked={liked}
        project={project}
        viewCount={viewCount}
        onFork={handleFork}
        onLike={handleLike}
      />

      <CommentSection projectId={Number(id)} projectCreatorId={project.creator?.id} />
    </GameViewerLayout>
  );
};
