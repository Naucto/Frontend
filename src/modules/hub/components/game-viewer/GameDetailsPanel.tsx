import { type ProjectExResponseDto, type UserBasicInfoDto } from "@api";
import * as urls from "@shared/route";
import { UserAvatarStack } from "@shared/user/UserProfileLink";

import { type JSX } from "react";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { Box, Button, Chip, Typography } from "@mui/material";
import { alpha, styled } from "@mui/material/styles";
import { Link } from "react-router-dom";

import CommentSvg from "@assets/comment.svg";
import LikeSvg from "@assets/like.svg";

export type ForkedFromInfo = {
  creator: UserBasicInfoDto | null;
  id: number;
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

const AttributionLine = styled(Typography)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: theme.spacing(0.75),
  color: theme.palette.grey[400],
}));

const ForkedGameLink = styled(Link)(({ theme }) => ({
  color: theme.palette.common.white,
  fontWeight: 700,
  textDecoration: "none",
  "&:hover": {
    color: theme.palette.yellow[500],
    textDecoration: "underline",
  },
}));

const TagRow = styled(Box)(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(1),
  marginTop: theme.spacing(1.5),
}));

const TagChip = styled(Chip)(({ theme }) => ({
  backgroundColor: alpha(theme.palette.common.white, 0.12),
  color: theme.palette.common.white,
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
  color: theme.palette.grey[200],
  fontSize: "14px",
}));

const StatLabel = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(0.75),
}));

const LikeCounterButton = styled(Button, {
  shouldForwardProp: (prop) => prop !== "$liked",
})<{ $liked: boolean }>(({ theme, $liked }) => ({
  justifyContent: "space-between",
  minWidth: "100%",
  padding: theme.spacing(0.875, 1.25),
  color: theme.palette.common.white,
  borderColor: $liked
    ? alpha(theme.palette.red[400], 0.72)
    : alpha(theme.palette.common.white, 0.16),
  backgroundColor: $liked
    ? alpha(theme.palette.red[500], 0.34)
    : alpha(theme.palette.common.white, 0.05),
  transition: "transform 0.2s",
  "&:hover": {
    transform: "translateY(-1px)",
    borderColor: $liked
      ? alpha(theme.palette.red[400], 0.92)
      : alpha(theme.palette.common.white, 0.28),
    backgroundColor: $liked
      ? alpha(theme.palette.red[500], 0.46)
      : alpha(theme.palette.common.white, 0.08),
  },
  "& img": {
    filter: $liked
      ? "invert(23%) sepia(97%) saturate(3000%) hue-rotate(345deg) brightness(95%)"
      : "invert(70%) sepia(0%) saturate(0%) brightness(90%)",
    imageRendering: "pixelated",
  },
}));

function getCreators(project: ProjectExResponseDto): UserBasicInfoDto[] {
  return Array.from(
    new Map(
      [project.creator, ...project.collaborators]
        .filter((creator): creator is UserBasicInfoDto => Boolean(creator))
        .map((creator) => [creator.id, creator])
    ).values()
  );
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
}: GameDetailsPanelProps): JSX.Element => {
  const creators = getCreators(project);

  return (
    <Description>
      <InfoLayout>
        <DetailsColumn>
          <Typography variant="h5" color="white">
            About this game
          </Typography>
          <AttributionLine variant="body2">
            <span>Made by</span>
            <UserAvatarStack users={creators} avatarSize={30} />
          </AttributionLine>
          {forkedFromInfo ? (
            <AttributionLine variant="body2">
              <span>Forked from:</span>
              <ForkedGameLink to={urls.toProjectView(forkedFromInfo.id)}>
                {forkedFromInfo.name}
              </ForkedGameLink>
              {forkedFromInfo.creator ? (
                <>
                  <span>by</span>
                  <UserAvatarStack users={[forkedFromInfo.creator]} avatarSize={30} />
                </>
              ) : null}
            </AttributionLine>
          ) : null}
          <Typography variant="body1">
            {String(project.longDesc || project.shortDesc || "No description available.")}
          </Typography>
          {project.tags.length > 0 ? (
            <TagRow>
              {project.tags.map((tag) => (
                <TagChip key={tag} label={tag} size="small" />
              ))}
            </TagRow>
          ) : null}
        </DetailsColumn>

        <StatsPanel>
          <LikeCounterButton $liked={liked} variant="outlined" onClick={onLike}>
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
          {canFork ? (
            <Button
              variant="contained"
              startIcon={<ContentCopyIcon />}
              onClick={onFork}
              disabled={forking}
              size="small"
            >
              {forking ? "Forking..." : "Fork project"}
            </Button>
          ) : null}
        </StatsPanel>
      </InfoLayout>
    </Description>
  );
};
