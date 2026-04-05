import { Typography } from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";
import { styled } from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { useLocation, useNavigate } from "react-router-dom";
import Card from "@modules/projects/components/Card";
import * as urls from "@shared/route";
import LikeSvg from "@assets/like.svg";
import CommentSvg from "@assets/comment.svg";
import { getCachedProjectImageUrl } from "@utils/projectImageCache";
import {
  ProjectResponseDto,
  projectControllerGetPublishedProjectImage,
  projectControllerGetProjectImage
} from "@api";

type ProjectCardProps = {
  project: ProjectResponseDto;
  isPlayable?: boolean;
};

const StyledCard = styled(Card, {
  shouldForwardProp: (prop) => prop !== "$src",
})<{ $src: string }>(({ $src }) => ({
  backgroundImage: $src ? `url(${$src})` : "none",
  backgroundSize: "cover",
  backgroundPosition: "center",
}));

const PlayableCardButton = styled("button")(({ theme }) => ({
  width: "100%",
  padding: 0,
  border: "none",
  background: "transparent",
  color: theme.palette.text.primary,
  textAlign: "left",
  cursor: "pointer",
}));

const Thumbnail = styled("div", {
  shouldForwardProp: (prop) => prop !== "$src",
})<{ $src: string }>(({ theme, $src }) => ({
  width: "100%",
  aspectRatio: "16 / 9",
  borderRadius: theme.custom.rounded.md,
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  backgroundImage: $src ? `url(${$src})` : "none",
  backgroundSize: "cover",
  backgroundPosition: "center",
  overflow: "hidden",
  boxShadow: "0 14px 40px rgba(0, 0, 0, 0.18)",
}));

const PlayableMeta = styled("div")(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: theme.spacing(2),
  paddingTop: theme.spacing(1),
}));

const CopyColumn = styled("div")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(0.35),
  minWidth: 0,
  flex: 1,
  paddingLeft: theme.spacing(0.5),
}));

const Title = styled(Typography)(({ theme }) => ({
  fontSize: "20px",
  fontWeight: 600,
  lineHeight: 1.1,
  color: theme.palette.text.primary,
}));

const Description = styled(Typography)(({ theme }) => ({
  fontSize: "14px",
  color: theme.palette.grey[400],
  lineHeight: 1.15,
  display: "-webkit-box",
  overflow: "hidden",
  textOverflow: "ellipsis",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
}));

const StatsColumn = styled("div")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(0.55),
  alignItems: "flex-end",
  minWidth: "92px",
}));

const StatItem = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(0.75),
  color: theme.palette.grey[300],
  fontSize: "12px",
  lineHeight: 1,
}));

const TruncatedText = styled(Typography)(({ theme }) => ({
  fontSize: "16px",
  color: theme.palette.text.primary,
  fontWeight: "normal",
  padding: theme.spacing(0, 0),
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
  const location = useLocation();
  const [thumbnailUrl, setThumbnailUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const loadImage = async (): Promise<void> => {
      const imageUrl = await getCachedProjectImageUrl(
        isPlayable ? "published" : "draft",
        project.id,
        async () => {
          const res = isPlayable
            ? await projectControllerGetPublishedProjectImage({ path: { id: project.id } })
            : await projectControllerGetProjectImage({ path: { id: project.id } });

          return res.status !== 204 && res.status !== 404 && res.data?.url
            ? res.data.url
            : null;
        },
        typeof project.iconUrl === "string" ? project.iconUrl : null,
      );

      if (!cancelled) {
        setThumbnailUrl(imageUrl);
      }
    };

    void loadImage();
    return () => {
      cancelled = true;
    };
  }, [project.id, project.iconUrl, isPlayable]);

  const redirectToProject = (): void => {
    if (isPlayable) {
      navigate(urls.toProjectView(project.id), {
        state: { backgroundLocation: location }
      });
    } else {
      navigate(urls.toProject(project.id));
    }
  };

  const description = useMemo(
    () => project.shortDesc || project.longDesc || "No description available.",
    [project.longDesc, project.shortDesc]
  );

  if (isPlayable) {
    return (
      <PlayableCardButton type="button" onClick={redirectToProject}>
        <Thumbnail $src={thumbnailUrl} />
        <PlayableMeta>
          <CopyColumn>
            <Title variant="h6">{project.name}</Title>
            <Description variant="body2">{description}</Description>
          </CopyColumn>
          <StatsColumn>
            <StatItem>
              <VisibilityOutlinedIcon sx={{ fontSize: 14 }} />
              <span>{project.viewCount ?? 0}</span>
            </StatItem>
            <StatItem>
              <img src={LikeSvg} width="14" height="14" style={{ imageRendering: "pixelated" }} alt="likes" />
              <span>{project.likes ?? 0}</span>
            </StatItem>
            <StatItem>
              <img src={CommentSvg} width="14" height="14" style={{ imageRendering: "pixelated" }} alt="comments" />
              <span>{project.commentCount ?? 0}</span>
            </StatItem>
          </StatsColumn>
        </PlayableMeta>
      </PlayableCardButton>
    );
  }

  return (
    <StyledCard onClick={redirectToProject} $src={thumbnailUrl}>
      <ProjectFooter>
        <TruncatedText variant="h6">{project.name}</TruncatedText>
      </ProjectFooter>
    </StyledCard>
  );
};

export default ProjectCard;
