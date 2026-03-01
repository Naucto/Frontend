import { styled } from "@mui/material/styles";
import { JSX, useEffect, useState } from "react";
import { ProjectResponseDto, ProjectsService } from "@api";
import { useAsync } from "src/hooks/useAsync";
import { Box, IconButton, Typography } from "@mui/material";
import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import ProjectCard from "@modules/projects/components/ProjectCard";

const PageContainer = styled("div")(({ theme }) => ({
  margin: theme.spacing(4),
}));

const CategorySection = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(4),
}));

const CategoryHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: theme.spacing(2),
}));

const CategoryTitle = styled(Typography)(({ theme }) => ({
  fontSize: "24px",
  fontWeight: "500",
  color: theme.palette.text.primary,
}));

const ViewMoreButton = styled(Typography)(({ theme }) => ({
  fontSize: "14px",
  color: theme.palette.primary.main,
  cursor: "pointer",
  "&:hover": {
    textDecoration: "underline",
  },
}));

const ScrollContainer = styled(Box)(() => ({
  position: "relative",
}));

const ProjectsScroller = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(2),
  overflowX: "auto",
  scrollBehavior: "smooth",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": {
    display: "none",
  },
  paddingBottom: theme.spacing(1),
}));

const ScrollArea = styled(Box)(() => ({
  position: "absolute",
  top: 0,
  bottom: 0,
  width: "80px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2,
  cursor: "pointer",
  "&:hover": {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    "& .scroll-button": {
      opacity: 1,
    },
  },
}));

const LeftScrollArea = styled(ScrollArea)({
  left: 0,
  background: "linear-gradient(to right, rgba(0, 0, 0, 0.5), transparent)",
  "&:hover": {
    background: "linear-gradient(to right, rgba(0, 0, 0, 0.7), transparent)",
  },
});

const RightScrollArea = styled(ScrollArea)({
  right: 0,
  background: "linear-gradient(to left, rgba(0, 0, 0, 0.5), transparent)",
  "&:hover": {
    background: "linear-gradient(to left, rgba(0, 0, 0, 0.7), transparent)",
  },
});

const ScrollButton = styled(IconButton)(({ theme }) => ({
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  color: theme.palette.common.white,
  opacity: 0,
  transition: "opacity 0.3s, background-color 0.3s",
  pointerEvents: "none",
  "&:hover": {
    backgroundColor: "rgba(0, 0, 0, 0.9)",
  },
}));

const ProjectCardWrapper = styled(Box)({
  minWidth: "300px",
  maxWidth: "300px",
  flexShrink: 0,
});

export const Hub = (): JSX.Element => {
  const [publishedProjects, setPublishedProjects] = useState<ProjectResponseDto[]>([]);
  const [newGames, setNewGames] = useState<ProjectResponseDto[]>([]);
  const [playedGames, setPlayedGames] = useState<ProjectResponseDto[]>([]);

  const { value: allProjects } = useAsync(
    ProjectsService.projectControllerGetAllReleases,
    []
  );

  useEffect(() => {
    if (allProjects) {
      const published = allProjects.filter(project => project.status === ProjectResponseDto.status.COMPLETED);
      setPublishedProjects(published);

      const sortedByDate = [...published].sort((a, b) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      setNewGames(sortedByDate);

      setPlayedGames(published);
    }
  }, [allProjects]);

  const scroll = (elementId: string, direction: "left" | "right"): void => {
    const container = document.getElementById(elementId);
    if (container) {
      const scrollAmount = direction === "left" ? -340 : 340;
      container.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  const renderCategory = (title: string, projects: ProjectResponseDto[], scrollId: string): JSX.Element => (
    <CategorySection>
      <CategoryHeader>
        <CategoryTitle>{title}</CategoryTitle>
        <ViewMoreButton>View more</ViewMoreButton>
      </CategoryHeader>
      <ScrollContainer>
        <LeftScrollArea
          onClick={() => scroll(scrollId, "left")}
        >
          <ScrollButton className="scroll-button" size="small">
            <ChevronLeft />
          </ScrollButton>
        </LeftScrollArea>
        <ProjectsScroller id={scrollId}>
          {projects.map((project) => (
            <ProjectCardWrapper key={project.id}>
              <ProjectCard project={project} isPlayable />
            </ProjectCardWrapper>
          ))}
        </ProjectsScroller>
        <RightScrollArea
          onClick={() => scroll(scrollId, "right")}
        >
          <ScrollButton className="scroll-button" size="small">
            <ChevronRight />
          </ScrollButton>
        </RightScrollArea>
      </ScrollContainer>
    </CategorySection>
  );

  return (
    <PageContainer>
      {renderCategory("Popular games", publishedProjects, "popular-games")}
      {renderCategory("New games", newGames, "new-games")}
      {renderCategory("Played games", playedGames, "played-games")}
    </PageContainer>
  );
};
