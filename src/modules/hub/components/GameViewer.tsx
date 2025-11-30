import React, { useEffect, useMemo, useState } from "react";
import { styled } from "@mui/material/styles";
import { Box, Typography, IconButton, CircularProgress } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate, useParams } from "react-router-dom";
import { ProjectsService, ProjectWithRelationsResponseDto } from "@api";
import GameCanvas from "@shared/canvas/gameCanvas/GameCanvas";
import { SpriteRendererHandle } from "@shared/canvas/RendererHandle";
import { EnvData } from "@shared/luaEnvManager/LuaEnvironmentManager";
import { GameProvider, ProviderEventType } from "@providers/GameProvider";

const Overlay = styled(Box)(() => ({
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.9)",
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
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  "&:hover": {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
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
  backgroundColor: theme.palette.grey[900],
  marginBottom: theme.spacing(3),
  borderRadius: theme.shape.borderRadius,
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}));

const Description = styled(Box)(({ theme }) => ({
  color: theme.palette.grey[300],
  backgroundColor: theme.palette.grey[900],
  padding: theme.spacing(3),
  borderRadius: theme.shape.borderRadius,
}));

const PlayingCanvas = styled(GameCanvas)(() => ({
  width: "100% !important",
  height: "100% !important",
  objectFit: "contain",
}));

export const GameViewer: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectWithRelationsResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = React.useRef<SpriteRendererHandle>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [code, setCode] = useState<string>("");
  const [output, setOutput] = useState<string>("");

  const [ gameProvider, setGameProvider ] = useState<GameProvider>();
  const [ showGame, setShowGame ] = useState(false);

  useEffect(() => {
    if (id) {
      const provider = new GameProvider(Number(id));
      setGameProvider(provider);

      provider.observe(ProviderEventType.INITIALIZED, () => {
        setShowGame(true);
        setCode(String(provider.code || ""));
      });
    }
  }, [id]);

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
        const projectDetails = await ProjectsService.projectControllerFindOne(Number(id));
        setProject(projectDetails);
      } catch (error) {
        console.error("Error loading project:", error);
        alert("Failed to load project");
      } finally {
        setLoading(false);
      }
    };

    fetchProjectData();
  }, [id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (showGame && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showGame]);

  const handleClose = (): void => {
    navigate("/");
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
            <Box display="flex" justifyContent="center" alignItems="center" height="100%">
              <CircularProgress />
            </Box>
          )}
        </GameContainer>

        <Description>
          <Typography variant="h5" gutterBottom color="white">
            About this game
          </Typography>
          <Typography variant="body1">
            {String(project.longDesc || project.shortDesc || "No description available.")}
          </Typography>
          <Box mt={2}>
            <Typography variant="caption" color="grey.500">
              Created by: {project.creator?.username || "Unknown"}
            </Typography>
          </Box>
        </Description>
      </Container>
    </Overlay>
  );
};
