import { type JSX, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  projectControllerGetRelease,
  projectControllerGetPublishedProjectImage,
  projectControllerLikeProject,
  projectControllerGetLikeStatus,
  projectControllerRegisterReleaseView,
  ProjectExResponseDto,
  projectControllerFork
} from "@api";
import { type SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { type EnvData } from "@shared/luaEnvManager/LuaEnvironmentManager";
import { GameProvider, ProviderEventType } from "@providers/GameProvider";
import { useUser } from "@providers/UserProvider";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import { getCachedProjectImageUrl } from "@utils/projectImageCache";
import CommentSection from "./CommentSection";
import { useSnackbar } from "notistack";
import * as urls from "@shared/route";
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

export const GameViewer = (): JSX.Element => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [launching, setLaunching] = useState(false);
  const { user } = useUser();
  const { enqueueSnackbar } = useSnackbar();
  const [project, setProject] = useState<ProjectExResponseDto | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [forking, setForking] = useState(false);
  const [forkedFromInfo, setForkedFromInfo] = useState<ForkedFromInfo | null>(null);
  const canvasRef = useRef<SpriteRendererHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [bannerUrl, setBannerUrl] = useState<string>("");

  const [ gameProvider, setGameProvider ] = useState<GameProvider>();
  const [ showGame, setShowGame ] = useState(false);

  // Like state
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

  useEffect(() => {
    const fetchProjectData = async (): Promise<void> => {
      if (!id) return;

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
              changes: { viewCount: viewData.viewCount }
            }
          }));
        }
        LocalStorageManager.addPlayedProject(Number(id));
        window.dispatchEvent(new Event("played-history-updated"));

        // Check like status
        if (user) {
          try {
            const { data: likeData } = await projectControllerGetLikeStatus({ path: { id } });
            if (likeData) setLiked(likeData.liked);
          } catch {
            // Not critical
          }
        } else {
          // Check anonymous like from localStorage
          setLiked(LocalStorageManager.isProjectLiked(Number(id)));
        }

        if (proj?.forkedFromId) {
          try {
            const { data: sourceProject } = await projectControllerGetRelease({ path: { id: String(proj.forkedFromId) } });
            const source = sourceProject as ProjectExResponseDto | undefined;
            if (source) {
              setForkedFromInfo({
                name: source.name,
                creator: source.creator?.username || "Unknown"
              });
            }
          } catch {
            setForkedFromInfo(null);
          }
        }
      } catch (error) {
        console.error("Error loading project:", error);
        alert("Failed to load project");
      } finally {
        setLoading(false);
      }
    };

    fetchProjectData();
  }, [id, user]);

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
      setLaunching(false);
    });
  };

  useEffect(() => {
    if (!showGame) {
      return;
    }

    const focusCanvas = (): void => {
      containerRef.current?.querySelector("canvas")?.focus();
    };

    focusCanvas();
    const frame = window.requestAnimationFrame(focusCanvas);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [showGame]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const target = e.target;
      const isEditableTarget =
        target instanceof HTMLElement &&
        (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest("[contenteditable='true'], input, textarea, [role='textbox']") !== null
        );

      if (isEditableTarget) {
        return;
      }

      if (showGame && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showGame]);

  const handleClose = (): void => {
    if ((location.state as { backgroundLocation?: Location } | null)?.backgroundLocation) {
      navigate(-1);
      return;
    }
    navigate("/hub");
  };

  const handleLike = async (): Promise<void> => {
    if (!id) return;
    try {
      const { data } = await projectControllerLikeProject({ path: { id } });
      if (data) {
        setLiked(data.liked);
        setLikeCount(data.likes);
        window.dispatchEvent(new CustomEvent("project-stats-updated", {
          detail: {
            projectId: Number(id),
            changes: { likes: data.likes }
          }
        }));
      }
      // Track in localStorage for anonymous users
      if (!user) {
        if (liked) {
          LocalStorageManager.removeLikedProject(Number(id));
        } else {
          LocalStorageManager.addLikedProject(Number(id));
        }
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  };

  const handleFork = async (): Promise<void> => {
    if (!id || forking) return;
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
            changes: { forkCount: nextForkCount }
          }
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
      <GameTitle variant="h3">{project.name}</GameTitle>

      <PlayableGameFrame
        bannerUrl={bannerUrl}
        canvasRef={canvasRef}
        containerRef={containerRef}
        envData={envData}
        gameProvider={gameProvider}
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
