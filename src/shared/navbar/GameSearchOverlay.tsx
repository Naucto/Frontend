import { projectControllerGetAllReleases, projectControllerGetPublishedProjectImage, ProjectExResponseDto, ProjectResponseDto } from "@api";
import LikeSvg from "@assets/like.svg";
import CommentSvg from "@assets/comment.svg";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { Box, Button, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import * as urls from "@shared/route";
import { useAsync } from "src/hooks/useAsync";
import { getCachedProjectImageUrl } from "@utils/projectImageCache";
import { JSX, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const OverlayContainer = styled(Box)(({ theme }) => ({
  position: "absolute",
  top: `calc(100% + ${theme.spacing(1.5)})`,
  left: 0,
  right: 0,
  zIndex: 1300,
}));

const SearchResultsPanel = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1.5),
  borderRadius: theme.custom.rounded.md,
  backgroundColor: "rgba(0, 0, 0, 0.52)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.08)",
  maxHeight: "720px",
  overflowY: "auto",
  scrollbarWidth: "thin",
  scrollbarColor: `${theme.palette.gray[400]} rgba(255,255,255,0.06)`,
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(1.25),
  boxShadow: "0 24px 64px rgba(0, 0, 0, 0.4)",
  "&::-webkit-scrollbar": {
    width: 12,
  },
  "&::-webkit-scrollbar-track": {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 999,
  },
  "&::-webkit-scrollbar-thumb": {
    backgroundColor: theme.palette.gray[400],
    borderRadius: 999,
    border: "2px solid rgba(0,0,0,0)",
    backgroundClip: "padding-box",
  },
  "&::-webkit-scrollbar-thumb:hover": {
    backgroundColor: theme.palette.gray[300],
  },
}));

const SearchResultsFooter = styled(Box)(({ theme }) => ({
  paddingTop: theme.spacing(0.5),
  display: "flex",
  justifyContent: "center",
}));

const LoadMoreButton = styled(Button)(({ theme }) => ({
  borderColor: "rgba(255,255,255,0.18)",
  color: theme.palette.common.white,
  backgroundColor: "rgba(20, 20, 20, 0.42)",
  "&:hover": {
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(20, 20, 20, 0.55)",
  },
}));

const SearchResultButton = styled("button")(({ theme }) => ({
  width: "100%",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: theme.custom.rounded.md,
  backgroundColor: "rgba(0, 0, 0, 0.42)",
  padding: theme.spacing(1.25),
  display: "flex",
  alignItems: "stretch",
  gap: theme.spacing(1.5),
  color: theme.palette.common.white,
  cursor: "pointer",
  textAlign: "left",
  transition: "transform 0.16s ease, background-color 0.16s ease",
  "&:hover": {
    backgroundColor: "rgba(0, 0, 0, 0.56)",
    transform: "translateY(-1px)",
  },
}));

const SearchThumbnail = styled(Box, {
  shouldForwardProp: (prop) => prop !== "$src",
})<{ $src: string }>(({ theme, $src }) => ({
  width: "200px",
  minWidth: "200px",
  aspectRatio: "16 / 9",
  borderRadius: theme.custom.rounded.md,
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  backgroundImage: $src ? `url(${$src})` : "none",
  backgroundSize: "cover",
  backgroundPosition: "center",
}));

const SearchResultContent = styled(Box)(({ theme }) => ({
  display: "flex",
  flex: 1,
  minWidth: 0,
  justifyContent: "space-between",
  gap: theme.spacing(2),
}));

const SearchResultCopy = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(0.5),
  minWidth: 0,
}));

const SearchResultTitle = styled(Typography)(({ theme }) => ({
  color: theme.palette.common.white,
  fontSize: "20px",
  fontWeight: 600,
  lineHeight: 1.1,
}));

const SearchResultCreators = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[300],
  fontSize: "13px",
}));

const SearchResultDescription = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontSize: "14px",
  lineHeight: 1.35,
  display: "-webkit-box",
  overflow: "hidden",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 3,
  textOverflow: "ellipsis",
}));

const SearchResultTags = styled(Box)(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(0.75),
  marginTop: theme.spacing(0.25),
}));

const SearchTag = styled("span")(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  padding: `${theme.spacing(0.35)} ${theme.spacing(0.9)}`,
  borderRadius: 999,
  backgroundColor: "rgba(70, 125, 255, 0.2)",
  border: "1px solid rgba(110, 165, 255, 0.28)",
  color: theme.palette.common.white,
  fontFamily: theme.typography.fontFamily,
  fontSize: "12px",
  fontWeight: 500,
  lineHeight: 1,
}));

const SearchResultStats = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  justifyContent: "center",
  gap: theme.spacing(0.75),
  minWidth: "96px",
}));

const SearchStat = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(0.75),
  color: theme.palette.grey[200],
  fontSize: "13px",
}));

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, (_, row) => Array.from({ length: b.length + 1 }, (_, col) => (row === 0 ? col : col === 0 ? row : 0)));

  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function scoreTextMatch(term: string, fieldValue: string): number {
  const text = normalizeSearchText(fieldValue);
  if (!term || !text) return 0;
  if (text === term) return 1;
  if (text.startsWith(term)) return 0.94;
  if (text.includes(term)) return 0.82;

  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  let bestScore = 0;

  for (const word of words) {
    const distance = levenshteinDistance(term, word);
    const candidateScore = 1 - distance / Math.max(term.length, word.length);
    if (candidateScore > bestScore) {
      bestScore = candidateScore;
    }
  }

  return bestScore >= 0.45 ? bestScore : 0;
}

type SearchableProject = ProjectExResponseDto & Partial<Pick<ProjectResponseDto, "viewCount" | "likes" | "commentCount">>;

type SearchResultItemProps = {
  project: SearchableProject;
  onSelect?: () => void;
};

const SearchResultItem = ({ project, onSelect }: SearchResultItemProps): JSX.Element => {
  const navigate = useNavigate();
  const location = useLocation();
  const [thumbnailUrl, setThumbnailUrl] = useState(project.iconUrl ?? "");

  useEffect(() => {
    let cancelled = false;

    const loadImage = async (): Promise<void> => {
      const imageUrl = await getCachedProjectImageUrl(
        "published",
        project.id,
        async () => {
          const response = await projectControllerGetPublishedProjectImage({ path: { id: project.id } });
          return response.status !== 204 && response.status !== 404 && response.data?.url
            ? response.data.url
            : null;
        },
        project.iconUrl,
      );

      if (!cancelled) {
        setThumbnailUrl(imageUrl);
      }
    };

    void loadImage();

    return () => {
      cancelled = true;
    };
  }, [project.iconUrl, project.id]);

  const creatorsLabel = [project.creator.username, ...project.collaborators.map((collaborator) => collaborator.username)]
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(", ");

  const description = project.shortDesc || project.longDesc || "No description available.";
  const visibleTags = project.tags.slice(0, 5);

  return (
    <SearchResultButton
      type="button"
      onClick={() => {
        onSelect?.();
        navigate(urls.toProjectView(project.id), { state: { backgroundLocation: location } });
      }}
    >
      <SearchThumbnail $src={thumbnailUrl} />
      <SearchResultContent>
        <SearchResultCopy>
          <SearchResultTitle>{project.name}</SearchResultTitle>
          <SearchResultCreators>{creatorsLabel}</SearchResultCreators>
          <SearchResultDescription>{description}</SearchResultDescription>
          {visibleTags.length > 0 && (
            <SearchResultTags>
              {visibleTags.map((tag) => (
                <SearchTag key={`${project.id}-${tag}`}>{tag}</SearchTag>
              ))}
            </SearchResultTags>
          )}
        </SearchResultCopy>
        <SearchResultStats>
          <SearchStat>
            <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />
            <span>{project.viewCount ?? 0}</span>
          </SearchStat>
          <SearchStat>
            <img src={LikeSvg} width="16" height="16" style={{ imageRendering: "pixelated" }} alt="likes" />
            <span>{project.likes ?? 0}</span>
          </SearchStat>
          <SearchStat>
            <img src={CommentSvg} width="16" height="16" style={{ imageRendering: "pixelated" }} alt="comments" />
            <span>{project.commentCount ?? 0}</span>
          </SearchStat>
          <SearchStat>
            <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />
            <span>{project.forkCount ?? 0}</span>
          </SearchStat>
        </SearchResultStats>
      </SearchResultContent>
    </SearchResultButton>
  );
};

type GameSearchOverlayProps = {
  query: string;
  onClose?: () => void;
};

export const GameSearchOverlay = ({ query, onClose }: GameSearchOverlayProps): JSX.Element | null => {
  const [visibleCount, setVisibleCount] = useState(10);
  const [statsOverrides, setStatsOverrides] = useState<Record<number, Partial<Pick<ProjectResponseDto, "viewCount" | "likes" | "commentCount" | "forkCount">>>>({});
  const trimmedQuery = normalizeSearchText(query);

  const { value: allProjects } = useAsync(
    () => projectControllerGetAllReleases().then(({ data }) => (data ?? []) as ProjectExResponseDto[]),
    []
  );

  useEffect(() => {
    const handleStatsUpdate = (event: Event): void => {
      const customEvent = event as CustomEvent<{
        projectId: number;
        changes: Partial<Pick<ProjectResponseDto, "viewCount" | "likes" | "commentCount" | "forkCount">>;
      }>;

      if (!customEvent.detail) {
        return;
      }

      setStatsOverrides((current) => ({
        ...current,
        [customEvent.detail.projectId]: {
          ...current[customEvent.detail.projectId],
          ...customEvent.detail.changes,
        },
      }));
    };

    window.addEventListener("project-stats-updated", handleStatsUpdate as EventListener);

    return () => {
      window.removeEventListener("project-stats-updated", handleStatsUpdate as EventListener);
    };
  }, []);

  const publishedProjects = useMemo<SearchableProject[]>(
    () =>
      (allProjects ?? [])
        .filter((project) => project.status === ("COMPLETED" satisfies ProjectResponseDto["status"]))
        .map((project) => ({
          ...project,
          ...statsOverrides[project.id],
        })),
    [allProjects, statsOverrides]
  );

  const searchResults = useMemo(() => {
    if (!trimmedQuery) {
      return [];
    }

    const queryTerms = trimmedQuery.split(/\s+/).filter(Boolean);

    return publishedProjects
      .map((project) => {
        const fields = [
          { value: project.name, weight: 5 },
          { value: [project.creator.username, ...project.collaborators.map((collaborator) => collaborator.username)].join(" "), weight: 3.2 },
          { value: project.shortDesc ?? "", weight: 2.4 },
          { value: project.longDesc ?? "", weight: 1.8 },
        ];

        let score = 0;
        let matchedTerms = 0;

        for (const term of queryTerms) {
          const bestFieldScore = Math.max(...fields.map(({ value, weight }) => scoreTextMatch(term, value) * weight));
          if (bestFieldScore > 0) {
            matchedTerms += 1;
            score += bestFieldScore;
          }
        }

        if (matchedTerms === 0) {
          return null;
        }

        const completionBonus = matchedTerms === queryTerms.length ? 1.25 : matchedTerms / queryTerms.length;

        return {
          project,
          score: score * completionBonus,
        };
      })
      .filter((entry): entry is { project: SearchableProject; score: number } => entry !== null && entry.score > 0.9)
      .sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff !== 0) {
          return scoreDiff;
        }
        return (b.project.likes ?? 0) - (a.project.likes ?? 0);
      })
      .map((entry) => entry.project);
  }, [publishedProjects, trimmedQuery]);

  const visibleResults = useMemo(
    () => searchResults.slice(0, visibleCount),
    [searchResults, visibleCount]
  );

  useEffect(() => {
    setVisibleCount(10);
  }, [trimmedQuery]);

  if (!trimmedQuery) {
    return null;
  }

  return (
    <OverlayContainer>
      <SearchResultsPanel>
        {visibleResults.length > 0 ? (
          <>
            {visibleResults.map((project) => (
              <SearchResultItem key={`search-${project.id}`} project={project} onSelect={onClose} />
            ))}
            {searchResults.length > visibleResults.length && (
              <SearchResultsFooter>
                <LoadMoreButton variant="outlined" onClick={() => setVisibleCount((value) => value + 10)}>
                  Load more
                </LoadMoreButton>
              </SearchResultsFooter>
            )}
          </>
        ) : (
          <Typography color="rgba(255,255,255,0.72)">
            No matching games found.
          </Typography>
        )}
      </SearchResultsPanel>
    </OverlayContainer>
  );
};
