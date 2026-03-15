import { Typography } from "@mui/material";
import React, { useEffect, useState } from "react";
import { styled } from "@mui/material";
import { useNavigate } from "react-router-dom";
import Card from "@modules/projects/components/Card";
import * as urls from "@shared/route";
import {
  ProjectResponseDto,
  publicControllerGetPublishedProjectImage,
  projectControllerGetProjectImage
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

const StyledCard = styled(Card)<{ src: string}>(({ src }) => ({
  backgroundImage: src ? `url(${src})` : "none",
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
  const [thumbnailUrl, setThumbnailUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const loadImage = async (): Promise<void> => {
      try {
        if (isPlayable) {
          const res = await publicControllerGetPublishedProjectImage({
            path: { id: project.id }
          });
          if (!cancelled && res.data?.url) {
            setThumbnailUrl(res.data.url);
            return;
          }
        } else {
          const res = await projectControllerGetProjectImage({
            path: { id: project.id }
          });
          if (!cancelled && res.data?.url) {
            setThumbnailUrl(res.data.url);
            return;
          }
        }
      } catch {
        // Image not found on CDN, fall back to iconUrl
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

  return (
    <StyledCard onClick={redirectToProject} src={thumbnailUrl}>
      <ProjectFooter>
        <Text variant="h6">{project.name}</Text>
      </ProjectFooter>
    </StyledCard>
  );
};

export default ProjectCard;
