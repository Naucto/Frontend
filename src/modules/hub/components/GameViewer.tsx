import React, { useEffect, useMemo, useState } from "react";
import { styled } from "@mui/material/styles";
import { Box, Chip, Typography, IconButton, CircularProgress } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import LikeSvg from "@assets/like.svg";
import CommentSvg from "@assets/comment.svg";
import NextSvg from "@assets/next.svg";
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
import { Button } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import GameCanvas from "@shared/canvas/gameCanvas/GameCanvas";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { EnvData } from "@shared/luaEnvManager/LuaEnvironmentManager";
import { GameProvider, ProviderEventType } from "@providers/GameProvider";
import { useUser } from "@providers/UserProvider";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import { getCachedProjectImageUrl } from "@utils/projectImageCache";
import CommentSection from "./CommentSection";
import { useSnackbar } from "notistack";
import * as urls from "@shared/route";

const Overlay = styled(Box)(() => ({
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.64)",
  backdropFilter: "blur(6px)",
  zIndex: 9999,
  overflowY: "auto",
}));

const Container = styled(Box)(({ theme }) => ({
  maxWidth: "1200px",
  margin: "0 auto",
  padding: theme.spacing(4),
  position: "relative",
}));

const CloseButton = styled(IconButton)(({ theme }) => ({
  position: "absolute",
  top: theme.spacing(2),
  right: theme.spacing(2),
  color: theme.palette.common.white,
  backgroundColor: "rgba(0, 0, 0, 0.28)",
  "&:hover": {
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
}));

const GameTitle = styled(Typography)(({ theme }) => ({
  color: theme.palette.common.white,
  marginBottom: theme.spacing(2),
  textAlign: "center",
}));

const GameContainer = styled(Box)(({ theme }) => ({
  width: "100%",
  aspectRatio: "16/9",
  backgroundColor: "rgba(8, 12, 20, 0.74)",
  marginBottom: theme.spacing(3),
  borderRadius: theme.shape.borderRadius,
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}));

const Description = styled(Box)(({ theme }) => ({
  color: theme.palette.grey[300],
  backgroundColor: "rgba(10, 10, 10, 0.34)",
  padding: theme.spacing(3),
  borderRadius: theme.shape.borderRadius,
  backdropFilter: "blur(8px)",
}));

const MetaRow = styled(Box)(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: theme.spacing(1.5),
  marginTop: theme.spacing(1.5),
  color: theme.palette.grey[300],
}));

const StatItem = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(0.75),
  fontSize: "14px",
  color: theme.palette.grey[200],
}));

const TagRow = styled(Box)(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(1),
  marginTop: theme.spacing(1.5),
}));

const LikeButton = styled(IconButton, {
  shouldForwardProp: (prop) => prop !== "$liked",
})<{ $liked: boolean }>(({ $liked }) => ({
  padding: "4px",
  transition: "transform 0.2s",
  "&:hover": {
    transform: "scale(1.15)",
    backgroundColor: "transparent",
  },
  "& img": {
    filter: $liked
      ? "invert(23%) sepia(97%) saturate(3000%) hue-rotate(345deg) brightness(95%)"
      : "invert(70%) sepia(0%) saturate(0%) brightness(90%)",
    imageRendering: "pixelated",
  },
}));

const PlayingCanvas = styled(GameCanvas)(() => ({
  width: "100% !important",
  height: "100% !important",
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

const LaunchOverlay = styled(Box)(({ theme }) => ({
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

export const GameViewer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [launching, setLaunching] = useState(false);
  const { user } = useUser();
  const { enqueueSnackbar } = useSnackbar();
  const [project, setProject] = useState<ProjectExResponseDto | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [forking, setForking] = useState(false);
  const [forkedFromInfo, setForkedFromInfo] = useState<{ name: string; creator: string } | null>(null);
  const canvasRef = React.useRef<SpriteRendererHandle>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
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
    return (
      <Overlay>
        <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
          <CircularProgress />
        </Box>
      </Overlay>
    );
  }

  if (!project) {
    return (
      <Overlay>
        <Container>
          <CloseButton onClick={handleClose}>
            <CloseIcon />
          </CloseButton>
          <Typography color="white" textAlign="center">Project not found</Typography>
        </Container>
      </Overlay>
    );
  }

  const creators = Array.from(
    new Map(
      [project.creator, ...project.collaborators].filter(Boolean).map((creator) => [creator.id, creator])
    ).values()
  );
  const creatorNames = creators.map((creator) => creator.username);
  const creatorsLabel =
    creatorNames.length <= 1
      ? creatorNames[0] ?? "Unknown"
      : `${creatorNames.slice(0, -1).join(", ")} and ${creatorNames[creatorNames.length - 1]}`;

  return (
    <Overlay>
      <Container>
        <CloseButton onClick={handleClose}>
          <CloseIcon />
        </CloseButton>

        <GameTitle variant="h3">{project.name}</GameTitle>

        <GameContainer ref={containerRef} style={{ position: "relative" }}>
          {showGame && gameProvider ? (
            <PlayingCanvas
              ref={canvasRef}
              canvasProps={{
                map: gameProvider.map,
                screenSize: screenSize,
                sprite: gameProvider.sprite
              }}
              envData={envData}
              setOutput={setOutput}
            />
          ) : (
            <LaunchScreenButton type="button" onClick={handleLaunchGame} $src={bannerUrl}>
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

        <Description>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="h5" color="white">
              About this game
            </Typography>
            <Box display="flex" alignItems="center" gap={1}>
              <LikeButton $liked={liked} onClick={handleLike}>
                <img src={LikeSvg} width="24" height="24" alt="like" />
              </LikeButton>
              <Typography color="grey.300" fontSize="14px">
                {likeCount}
              </Typography>
            </Box>
          </Box>
          <Typography variant="body1">
            {String(project.longDesc || project.shortDesc || "No description available.")}
          </Typography>
          {project.tags.length > 0 && (
            <TagRow>
              {project.tags.map((tag) => (
                <Chip key={tag} label={tag} size="small" sx={{ backgroundColor: "rgba(255,255,255,0.12)", color: "white" }} />
              ))}
            </TagRow>
          )}
          <MetaRow>
            <StatItem>
              <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />
              <span>{viewCount}</span>
            </StatItem>
            <StatItem>
              <img src={LikeSvg} width="16" height="16" alt="likes" style={{ imageRendering: "pixelated" }} />
              <span>{likeCount}</span>
            </StatItem>
            <StatItem>
              <img src={CommentSvg} width="16" height="16" alt="comments" style={{ imageRendering: "pixelated" }} />
              <span>{project.commentCount ?? 0}</span>
            </StatItem>
            <StatItem>
              <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />
              <span>{forkCount}</span>
            </StatItem>
          </MetaRow>
          <Box mt={2} display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="body2" color="grey.400">
                A game made by {creatorsLabel}
              </Typography>
              <Typography variant="caption" color="grey.400">
                Creation date: {new Date(project.createdAt).toLocaleDateString("en-GB")}
              </Typography>
              {forkedFromInfo && (
                <Typography variant="caption" color="grey.500" display="block">
                  Forked from: {forkedFromInfo.name} by {forkedFromInfo.creator}
                </Typography>
              )}
            </Box>
            {user && (
              <Button
                variant="contained"
                startIcon={<ContentCopyIcon />}
                onClick={handleFork}
                disabled={forking}
                size="small"
              >
                {forking ? "Forking..." : "Fork this project"}
              </Button>
            )}
          </Box>
        </Description>

        <CommentSection projectId={Number(id)} projectCreatorId={project.creator?.id} />
      </Container>
    </Overlay>
  );
};
