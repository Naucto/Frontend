import { type ProjectResponseDto } from "@api";
import { Button, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import CreateProjectCard from "@modules/projects/components/CreateProjectCard";
import ProjectCard from "@modules/projects/components/ProjectCard";
import { type ProjectCategory } from "@modules/projects/projectListUtils";
import { type JSX } from "react";
import { CustomSortButton } from "./Controls";
import { EmptyState, LoadMoreRow, ProjectGrid } from "./Layout";

type ProjectSectionProps = {
  category: ProjectCategory;
  emptyMessage: string;
  isLoading: boolean;
  projects: ProjectResponseDto[];
  title: string;
  totalCount: number | null;
  visibleCount: number;
  includeCreateCard?: boolean;
  loadMoreLabel?: string;
  onLoadMore: (category: ProjectCategory) => void;
  onViewMore: (category: ProjectCategory) => void;
};

const Section = styled("section")(({ theme }) => ({
  marginTop: theme.spacing(4),
}));

const SectionHeader = styled("div")(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: theme.spacing(2),
  flexWrap: "wrap",
  marginBottom: theme.spacing(2),
}));

const SectionTitle = styled(Typography)(({ theme }) => ({
  fontSize: "24px",
  fontWeight: 500,
  color: theme.palette.text.primary,
}));

const ViewMoreButton = styled(Button)(({ theme }) => ({
  fontSize: "14px",
  color: theme.palette.primary.main,
  padding: 0,
  minWidth: 0,
  textTransform: "none",
  "&:hover": {
    backgroundColor: "transparent",
    textDecoration: "underline",
  },
}));

export const ProjectSection = ({
  category,
  emptyMessage,
  includeCreateCard = false,
  isLoading,
  loadMoreLabel = "Load more",
  projects,
  title,
  totalCount,
  visibleCount,
  onLoadMore,
  onViewMore,
}: ProjectSectionProps): JSX.Element => {
  const visibleProjects = projects.slice(0, visibleCount);
  const resolvedTotalCount = totalCount ?? projects.length;
  const canLoadMore = visibleCount < resolvedTotalCount;

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>{title}</SectionTitle>
        <ViewMoreButton onClick={() => onViewMore(category)}>
          {resolvedTotalCount} project{resolvedTotalCount === 1 ? "" : "s"}
        </ViewMoreButton>
      </SectionHeader>
      {projects.length > 0 || includeCreateCard ? (
        <>
          <ProjectGrid>
            {includeCreateCard ? <CreateProjectCard /> : null}
            {visibleProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </ProjectGrid>
          {canLoadMore ? (
            <LoadMoreRow>
              <CustomSortButton variant="outlined" onClick={() => onLoadMore(category)} disabled={isLoading}>
                {loadMoreLabel}
              </CustomSortButton>
            </LoadMoreRow>
          ) : null}
        </>
      ) : (
        <EmptyState>{emptyMessage}</EmptyState>
      )}
    </Section>
  );
};
