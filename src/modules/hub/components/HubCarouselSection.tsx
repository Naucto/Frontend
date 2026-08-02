import { ProjectExResponseDto } from "@api";
import ProjectCard from "@modules/projects/components/ProjectCard";

import { type JSX, type ReactNode } from "react";

import { Box, Button, IconButton, LinearProgress, Typography } from "@mui/material";
import { alpha, styled } from "@mui/material/styles";

import NextSvg from "@assets/next.svg";
import PrevSvg from "@assets/prev.svg";

const Section = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(4),
}));

const Header = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(1.25),
  marginBottom: theme.spacing(2),
}));

const HeaderTop = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: theme.spacing(1.5),
}));

const TitleRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: theme.spacing(1.5),
}));

const Title = styled(Typography)(({ theme }) => ({
  fontSize: "24px",
  fontWeight: "500",
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

const ScrollContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "flex-start",
  gap: theme.spacing(0.25),
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
  flex: 1,
}));

const ScrollArea = styled(Box)({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const ScrollButton = styled(IconButton)(({ theme }) => ({
  width: 116,
  height: 116,
  padding: 0,
  marginTop: 18,
  backgroundColor: "transparent",
  color: theme.palette.common.white,
  flexShrink: 0,
  "&:hover": {
    backgroundColor: alpha(theme.palette.common.white, 0),
    transform: "translateY(-1px)",
  },
}));

const ProjectCardWrapper = styled(Box)({
  minWidth: "300px",
  maxWidth: "300px",
  flexShrink: 0,
});

const ArrowIcon = styled("img")({
  width: "80px",
  height: "80px",
  imageRendering: "pixelated",
});

const LoadingBarContainer = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(1.5),
  width: "100%",
}));

const RoundedLinearProgress = styled(LinearProgress)({
  borderRadius: 999,
});

function scroll(elementId: string, direction: "left" | "right"): void {
  const container = document.getElementById(elementId);
  if (container) {
    const scrollAmount = direction === "left" ? -340 : 340;
    container.scrollBy({ left: scrollAmount, behavior: "smooth" });
  }
}

function isNearScrollEnd(elementId: string): boolean {
  const container = document.getElementById(elementId);

  if (!container) {
    return false;
  }

  return container.scrollLeft + container.clientWidth >= container.scrollWidth - 24;
}

type HubCarouselSectionProps = {
  title: string;
  scrollId: string;
  displayedCount: number;
  visibleProjects: ProjectExResponseDto[];
  canLoadMore: boolean;
  isLoadingMore: boolean;
  headerControls?: ReactNode;
  expandedContent?: ReactNode;
  onViewMore: () => void;
  onLoadMore: () => Promise<void>;
};

export const HubCarouselSection = ({
  title,
  scrollId,
  displayedCount,
  visibleProjects,
  canLoadMore,
  isLoadingMore,
  headerControls,
  expandedContent,
  onViewMore,
  onLoadMore,
}: HubCarouselSectionProps): JSX.Element => (
  <Section>
    <Header>
      <HeaderTop>
        <TitleRow>
          <Title>{title}</Title>
          {headerControls}
        </TitleRow>
        <ViewMoreButton onClick={onViewMore}>
          {displayedCount} games
        </ViewMoreButton>
      </HeaderTop>
      {expandedContent}
    </Header>
    <ScrollContainer>
      <ScrollArea onClick={() => scroll(scrollId, "left")}>
        <ScrollButton size="small">
          <ArrowIcon src={PrevSvg} alt="previous" />
        </ScrollButton>
      </ScrollArea>
      <ProjectsScroller id={scrollId}>
        {visibleProjects.map((project) => (
          <ProjectCardWrapper key={project.id}>
            <ProjectCard project={project} isPlayable />
          </ProjectCardWrapper>
        ))}
      </ProjectsScroller>
      <ScrollArea
        onClick={async () => {
          if (canLoadMore && isNearScrollEnd(scrollId)) {
            await onLoadMore();
          }

          requestAnimationFrame(() => scroll(scrollId, "right"));
        }}
      >
        <ScrollButton size="small">
          <ArrowIcon src={NextSvg} alt="next" />
        </ScrollButton>
      </ScrollArea>
    </ScrollContainer>
    {isLoadingMore ? (
      <LoadingBarContainer>
        <RoundedLinearProgress />
      </LoadingBarContainer>
    ) : null}
  </Section>
);
