import { Box, LinearProgress, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { ProjectExResponseDto } from "@api";
import ProjectCard from "@modules/projects/components/ProjectCard";
import { CustomSortButton } from "@modules/projects/components/browse/Controls";
import { type JSX } from "react";

const ProjectGrid = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
  gap: theme.spacing(2),
  alignItems: "start",
  marginTop: theme.spacing(3),
}));

const EmptyState = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontSize: "15px",
  padding: theme.spacing(3, 0),
}));

const LoadMoreRow = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "center",
  marginTop: theme.spacing(2),
}));

const LoadMoreContent = styled(Box)({
  width: "100%",
  maxWidth: 320,
});

const LoadMoreProgress = styled(LinearProgress)(({ theme }) => ({
  marginTop: theme.spacing(1),
  borderRadius: 999,
}));

type CategoryProjectsGridProps = {
  projects: ProjectExResponseDto[];
  visibleProjects: ProjectExResponseDto[];
  canLoadMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  emptyLabel?: string;
  onLoadMore: () => Promise<void> | void;
};

export const CategoryProjectsGrid = ({
  projects,
  visibleProjects,
  canLoadMore,
  isLoading,
  isLoadingMore,
  emptyLabel = "No games match the current selection.",
  onLoadMore,
}: CategoryProjectsGridProps): JSX.Element => {
  if (projects.length === 0) {
    return <EmptyState>{emptyLabel}</EmptyState>;
  }

  return (
    <>
      <ProjectGrid>
        {visibleProjects.map((project) => (
          <ProjectCard key={project.id} project={project} isPlayable />
        ))}
      </ProjectGrid>
      {canLoadMore ? (
        <LoadMoreRow>
          <LoadMoreContent>
            <CustomSortButton
              variant="outlined"
              onClick={() => void onLoadMore()}
              disabled={isLoading || isLoadingMore}
              fullWidth
            >
              Load more
            </CustomSortButton>
            {isLoadingMore ? <LoadMoreProgress /> : null}
          </LoadMoreContent>
        </LoadMoreRow>
      ) : null}
    </>
  );
};
