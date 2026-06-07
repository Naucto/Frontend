import React, { useCallback, useEffect, useMemo, useState } from "react";
import { alpha, styled } from "@mui/material/styles";
import { Box, Button, Chip, Typography, IconButton, CircularProgress } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
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

const Overlay = styled(Box)(({ theme }) => ({
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: alpha(theme.palette.common.black, 0.64),
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
  backgroundColor: alpha(theme.palette.common.black, 0.28),
  "&:hover": {
    backgroundColor: alpha(theme.palette.common.black, 0.45),
  },
}));

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

const GameTitle = styled(Typography)(({ theme }) => ({
  color: theme.palette.common.white,
  textAlign: "center",
  minWidth: 0,
  overflowWrap: "anywhere",
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

const GameContainer = styled(Box)(({ theme }) => ({
  width: "100%",
  aspectRatio: "16/9",
  backgroundColor: alpha(theme.palette.blue[900], 0.74),
  marginBottom: theme.spacing(3),
  borderRadius: theme.shape.borderRadius,
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}));

const Description = styled(Box)(({ theme }) => ({
  color: theme.palette.grey[300],
  backgroundColor: alpha(theme.palette.gray[900], 0.34),
  padding: theme.spacing(3),
  borderRadius: theme.shape.borderRadius,
  backdropFilter: "blur(8px)",
}));

const InfoLayout = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 220px",
  gap: theme.spacing(3),
  alignItems: "start",
  [theme.breakpoints.down("md")]: {
    gridTemplateColumns: "1fr",
  },
}));

const DetailsColumn = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(1),
  minWidth: 0,
}));

const StatsPanel = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(1),
  padding: theme.spacing(1.5),
  borderRadius: theme.custom.rounded.md,
  backgroundColor: alpha(theme.palette.common.white, 0.07),
  border: `1px solid ${alpha(theme.palette.common.white, 0.12)}`,
}));

const StatItem = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: theme.spacing(0.75),
  fontSize: "14px",
  color: theme.palette.grey[200],
}));

const StatLabel = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(0.75),
}));

const TagRow = styled(Box)(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(1),
  marginTop: theme.spacing(1.5),
}));

const LikeCounterButton = styled(Button, {
  shouldForwardProp: (prop) => prop !== "$liked",
})<{ $liked: boolean }>(({ theme, $liked }) => ({
  justifyContent: "space-between",
  padding: theme.spacing(0.875, 1.25),
  minWidth: "100%",
  color: theme.palette.common.white,
  borderColor: $liked ? alpha(theme.palette.red[400], 0.72) : alpha(theme.palette.common.white, 0.16),
  backgroundColor: $liked ? alpha(theme.palette.red[500], 0.34) : alpha(theme.palette.common.white, 0.05),
  transition: "transform 0.2s",
  "&:hover": {
    transform: "translateY(-1px)",
    borderColor: $liked ? alpha(theme.palette.red[400], 0.92) : alpha(theme.palette.common.white, 0.28),
    backgroundColor: $liked ? alpha(theme.palette.red[500], 0.46) : alpha(theme.palette.common.white, 0.08),
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
  backgroundColor: alpha(theme.palette.common.black, 0.42),
  backgroundImage: $src ? `url(${$src})` : "none",
  backgroundSize: "cover",
  backgroundPosition: "center",
}));

const LaunchOverlay = styled(Box)(({ theme }) => ({
  position: "absolute",
  inset: 0,
  background: `linear-gradient(180deg, ${alpha(theme.palette.common.black, 0.18)} 0%, ${alpha(theme.palette.common.black, 0.58)} 100%)`,
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
  textShadow: `0 4px 18px ${alpha(theme.palette.common.black, 0.55)}`,
}));

const TagChip = styled(Chip)(({ theme }) => ({
  backgroundColor: alpha(theme.palette.common.white, 0.12),
  color: theme.palette.common.white,
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
  const [code, setCode] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [bannerUrl, setBannerUrl] = useState<string>("");
  const [gameRefreshKey, setGameRefreshKey] = useState(0);

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

  const focusGameCanvas = useCallback((): void => {
    canvasRef.current?.getCanvas?.()?.focus();
  }, []);

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

  useEffect(() => {
    return () => {
      gameProvider?.destroy();
    };
  }, [gameProvider]);

  useEffect(() => {
    if (!showGame) {
      return;
    }

    const focusCanvas = (): void => {
      focusGameCanvas();
    };

    focusCanvas();
    const frame = window.requestAnimationFrame(focusCanvas);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [focusGameCanvas, showGame]);

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

        <HeaderBar>
          <Box />
          <GameTitle variant="h3">{project.name}</GameTitle>
          <HeaderActions>
            {showGame && (
              <RefreshGameButton
                variant="outlined"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={handleRefreshGame}
              >
                Refresh game
              </RefreshGameButton>
            )}
          </HeaderActions>
        </HeaderBar>

        <GameContainer style={{ position: "relative" }}>
          {showGame && gameProvider ? (
            <PlayingCanvas
              key={gameRefreshKey}
              ref={canvasRef}
              canvasProps={{
                map: gameProvider.map,
                screenSize: screenSize,
                sprite: gameProvider.sprite
              }}
              envData={envData}
              setOutput={setOutput}
              soundProvider={gameProvider.sound}
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
          <InfoLayout>
            <DetailsColumn>
              <Typography variant="h5" color="white">
                About this game
              </Typography>
              <Typography variant="body2" color="grey.400">
                A game made by {creatorsLabel}
              </Typography>
              {forkedFromInfo && (
                <Typography variant="body2" color="grey.400">
                  This game was forked from: {forkedFromInfo.name} by {forkedFromInfo.creator}
                </Typography>
              )}
              <Typography variant="body1">
                {String(project.longDesc || project.shortDesc || "No description available.")}
              </Typography>
              {project.tags.length > 0 && (
                <TagRow>
                  {project.tags.map((tag) => (
                    <TagChip key={tag} label={tag} size="small" />
                  ))}
                </TagRow>
              )}
              <Typography variant="caption" color="grey.500">
                Created by: {project.creator?.username || "Unknown"}
              </Typography>
              {forkedFromInfo && (
                <Typography variant="caption" color="grey.500" display="block">
                  Forked from: {forkedFromInfo.name} by {forkedFromInfo.creator}
                </Typography>
              )}
            </DetailsColumn>
            <StatsPanel>
              <LikeCounterButton $liked={liked} variant="outlined" onClick={handleLike}>
                <StatLabel>
                  <img src={LikeSvg} width="18" height="18" alt="like" />
                  <span>{liked ? "Liked" : "Like"}</span>
                </StatLabel>
                <span>{likeCount}</span>
              </LikeCounterButton>
              <StatItem>
                <StatLabel>
                  <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />
                  <span>Views</span>
                </StatLabel>
                <span>{viewCount}</span>
              </StatItem>
              <StatItem>
                <StatLabel>
                  <img src={CommentSvg} width="16" height="16" alt="comments" style={{ imageRendering: "pixelated" }} />
                  <span>Comments</span>
                </StatLabel>
                <span>{project.commentCount ?? 0}</span>
              </StatItem>
              <StatItem>
                <StatLabel>
                  <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />
                  <span>Forks</span>
                </StatLabel>
                <span>{forkCount}</span>
              </StatItem>
              <Typography variant="caption" color="grey.400">
                Created {new Date(project.createdAt).toLocaleDateString("en-GB")}
              </Typography>
              {user && (
                <Button
                  variant="contained"
                  startIcon={<ContentCopyIcon />}
                  onClick={handleFork}
                  disabled={forking}
                  size="small"
                >
                  {forking ? "Forking..." : "Fork project"}
                </Button>
              )}
            </StatsPanel>
          </InfoLayout>
        </Description>

        <CommentSection projectId={Number(id)} projectCreatorId={project.creator?.id} />
      </Container>
    </Overlay>
  );
};
