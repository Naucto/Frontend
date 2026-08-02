import {
  ProjectExResponseDto,
  userPublicControllerGetLikedGames,
  userPublicControllerGetPublicProfileByUsername,
  userPublicControllerGetPublishedGames,
} from "@api";
import { useAsync } from "@hooks/useAsync";
import ProjectCard from "@modules/projects/components/ProjectCard";
import * as urls from "@shared/navigation/routes";

import React from "react";

import { styled } from "@mui/material";
import { Box, Button, Typography } from "@mui/material";
import { Link, useParams } from "react-router-dom";

const PageContainer = styled("div")(({ theme }) => ({
  margin: theme.spacing(4),
}));

const HeaderRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: theme.spacing(2),
}));

const BackLink = styled(Link)(({ theme }) => ({
  color: theme.palette.grey[200],
  textDecoration: "none",
  fontSize: "22px",
  "&:hover": {
    textDecoration: "underline",
  },
}));

const CardsWrap = styled("div")(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
}));

const ProjectCardWrapper = styled(Box)(() => ({
  flex: "0 0 auto",
  width: 360,
}));

const StatusText = styled(Typography)(({ theme }) => ({
  marginTop: theme.spacing(2),
}));

const PaginationRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
}));

const PAGINATION_LIMIT = 20;

const PaginationButton = styled(Button)(({ theme }) => ({
  color: theme.palette.grey[200],
  "&.Mui-disabled": {
    color: theme.palette.grey[500],
  },
}));

type Props = {
  title: string;
  type: "liked" | "published";
  emptyLabel: string;
};

export const ProfileGamesSeeAllBase: React.FC<Props> = ({
  title,
  type,
  emptyLabel,
}) => {
  const { username } = useParams<{ username?: string }>();
  const [page, setPage] = React.useState(1);

  const { loading: loadingProfile, value: resolvedProfileId } = useAsync(
    async () => {
      if (!username) return Number.NaN;
      const { data } = await userPublicControllerGetPublicProfileByUsername({
        path: { username },
        throwOnError: true,
      });
      return typeof data?.data?.id === "number" ? data.data.id : Number.NaN;
    },
    [username]
  );
  const resolvedProfileIdNumber =
    typeof resolvedProfileId === "number" ? resolvedProfileId : Number.NaN;

  const { loading: loadingGames, value: games } = useAsync(
    async () => {
      if (!Number.isFinite(resolvedProfileIdNumber)) return [];
      const { data } =
        type === "liked"
          ? await userPublicControllerGetLikedGames({
            path: { id: resolvedProfileIdNumber },
            query: { page, limit: PAGINATION_LIMIT },
            throwOnError: true,
          })
          : await userPublicControllerGetPublishedGames({
            path: { id: resolvedProfileIdNumber },
            query: { page, limit: PAGINATION_LIMIT },
            throwOnError: true,
          });
      return (data ?? []) as ProjectExResponseDto[];
    },
    [resolvedProfileIdNumber, type, page]
  );

  const hasPrev = page > 1;
  const hasNext = (games ?? []).length === PAGINATION_LIMIT;
  const loading = loadingProfile || loadingGames;

  return (
    <PageContainer>
      <HeaderRow>
        <Typography variant="h4" color="white">
          {title}
        </Typography>
        {Number.isFinite(resolvedProfileIdNumber) && (
          <BackLink
            to={
              username ? urls.toProfileByUsername(username) : ""
            }
          >
            Back to profile
          </BackLink>
        )}
      </HeaderRow>

      {loading ? (
        <StatusText variant="body2" color="white">
          Loading...
        </StatusText>
      ) : (games ?? []).length === 0 ? (
        <StatusText variant="body2" color="white">
          {emptyLabel}
        </StatusText>
      ) : (
        <>
          <CardsWrap>
            {(games ?? []).map((game) => (
              <ProjectCardWrapper key={game.id}>
                <ProjectCard project={game} isPlayable />
              </ProjectCardWrapper>
            ))}
          </CardsWrap>
          <PaginationRow>
            <PaginationButton
              disabled={!hasPrev}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </PaginationButton>
            <Typography variant="body2" color="white">
              Page {page}
            </Typography>
            <PaginationButton
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </PaginationButton>
          </PaginationRow>
        </>
      )}
    </PageContainer>
  );
};

export default ProfileGamesSeeAllBase;
