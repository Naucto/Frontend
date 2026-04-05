import { IconButton, Tooltip, Typography } from "@mui/material";
import React, { useEffect, useState } from "react";
import { styled } from "@mui/material";
import { useNavigate } from "react-router-dom";
import Card from "@modules/projects/components/Card";
import * as urls from "@shared/route";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useSnackbar } from "notistack";
import { useUser } from "@providers/UserProvider";
import {
  ProjectResponseDto,
  projectControllerGetPublishedProjectImage,
  projectControllerGetProjectImage,
  projectControllerFork
} from "@api";

type ProjectCardProps = {
  project: ProjectResponseDto;
  isPlayable?: boolean;
}

const Text = styled(Typography)(({ theme }) => ({
  fontSize: "16px",
  color: theme.palette.text.primary,
  fontWeight: "normal",
  padding: theme.spacing(0, 0),
}));

const StyledCard = styled(Card, {
  shouldForwardProp: (prop) => prop !== "$src",
})<{ $src: string }>(({ $src }) => ({
  backgroundImage: $src ? `url(${$src})` : "none",
  backgroundSize: "cover",
  backgroundPosition: "center",
}));

const ProjectFooter = styled("div")(({ theme }) => ({
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",

  padding: theme.spacing(1, 1.5),
  backgroundColor: theme.palette.gray[900],
  borderBottomLeftRadius: theme.custom.rounded.md,
  borderBottomRightRadius: theme.custom.rounded.md,
}));

const ProjectCard: React.FC<ProjectCardProps> = ({ project, isPlayable = false }) => {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useUser();
  const [thumbnailUrl, setThumbnailUrl] = useState<string>("");
  const [forking, setForking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadImage = async (): Promise<void> => {
      const res = isPlayable
        ? await projectControllerGetPublishedProjectImage({ path: { id: project.id } })
        : await projectControllerGetProjectImage({ path: { id: project.id } });

      if (!cancelled && res.status !== 204 && res.status !== 404 && res.data?.url) {
        setThumbnailUrl(res.data.url);
        return;
      }

      if (!cancelled && typeof project.iconUrl === "string" && project.iconUrl) {
        setThumbnailUrl(project.iconUrl);
      }
    };

    loadImage();
    return () => { cancelled = true; };
  }, [project.id, project.iconUrl, isPlayable]);

  const redirectToProject = (): void => {
    if (isPlayable) {
      navigate(urls.toProjectView(project.id));
    } else {
      navigate(urls.toProject(project.id));
    }
  };

  const handleFork = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    if (forking) return;
    setForking(true);
    try {
      const { data: forkedProject } = await projectControllerFork({ path: { id: project.id } });
      if (forkedProject) {
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

  return (
    <StyledCard onClick={redirectToProject} $src={thumbnailUrl}>
      <ProjectFooter>
        <Text variant="h6">{project.name}</Text>
        {isPlayable && user && (
          <Tooltip title="Fork this project">
            <IconButton
              size="small"
              onClick={handleFork}
              disabled={forking}
              sx={{ color: "white", ml: 1, "&:hover": { backgroundColor: "rgba(255,255,255,0.15)" } }}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </ProjectFooter>
    </StyledCard>
  );
};

export default ProjectCard;
