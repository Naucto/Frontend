import CommentSvg from "@assets/comment.svg";
import LikeSvg from "@assets/like.svg";
import { type ProjectExResponseDto } from "@api";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { Box, Button, Chip, IconButton, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { type JSX } from "react";
import { ReportAction } from "../ReportAction";

export type ForkedFromInfo = {
  creator: string;
  name: string;
};

type GameDetailsPanelProps = {
  canFork: boolean;
  forkCount: number;
  forkedFromInfo: ForkedFromInfo | null;
  forking: boolean;
  likeCount: number;
  liked: boolean;
  project: ProjectExResponseDto;
  viewCount: number;
  onFork: () => Promise<void>;
  onLike: () => Promise<void>;
};

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
})<{ $liked: boolean }>(({ theme, $liked }) => ({
  padding: theme.spacing(0.5),
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

function getCreatorsLabel(project: ProjectExResponseDto): string {
  const creators = Array.from(
    new Map(
      [project.creator, ...project.collaborators].filter(Boolean).map((creator) => [creator.id, creator])
    ).values()
  );
  const creatorNames = creators.map((creator) => creator.username);

  if (creatorNames.length <= 1) {
    return creatorNames[0] ?? "Unknown";
  }

  return `${creatorNames.slice(0, -1).join(", ")} and ${creatorNames[creatorNames.length - 1]}`;
}

export const GameDetailsPanel = ({
  canFork,
  forkCount,
  forkedFromInfo,
  forking,
  likeCount,
  liked,
  project,
  viewCount,
  onFork,
  onLike,
}: GameDetailsPanelProps): JSX.Element => (
  <Description>
    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
      <Typography variant="h5" color="white">
        About this game
      </Typography>
      <Box display="flex" alignItems="center" gap={1}>
        <LikeButton $liked={liked} onClick={onLike}>
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
    {project.tags.length > 0 ? (
      <TagRow>
        {project.tags.map((tag) => (
          <Chip key={tag} label={tag} size="small" sx={{ backgroundColor: "rgba(255,255,255,0.12)", color: "white" }} />
        ))}
      </TagRow>
    ) : null}
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
          A game made by {getCreatorsLabel(project)}
        </Typography>
        <Typography variant="caption" color="grey.400">
          Creation date: {new Date(project.createdAt).toLocaleDateString("en-GB")}
        </Typography>
        {forkedFromInfo ? (
          <Typography variant="caption" color="grey.500" display="block">
            Forked from: {forkedFromInfo.name} by {forkedFromInfo.creator}
          </Typography>
        ) : null}
      </Box>
      {canFork ? (
        <Box display="flex" alignItems="center" gap={1}>
          <ReportAction targetType="PROJECT" targetId={project.id} />
          <Button
            variant="contained"
            startIcon={<ContentCopyIcon />}
            onClick={onFork}
            disabled={forking}
            size="small"
          >
            {forking ? "Forking..." : "Fork this project"}
          </Button>
        </Box>
      ) : (
        <ReportAction targetType="PROJECT" targetId={project.id} />
      )}
    </Box>
  </Description>
);
