import { CustomSortButton, SummaryChip } from "@modules/projects/components/browse/Controls";
import * as urls from "@shared/route";

import { type JSX } from "react";

import { Box, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";

const HeaderRow = styled(Box)(({ theme }) => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: theme.spacing(2),
  flexWrap: "wrap",
}));

const HeaderCopy = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(0.75),
}));

const Title = styled(Typography)(({ theme }) => ({
  fontSize: "32px",
  color: theme.palette.text.primary,
  fontWeight: "normal",
}));

const Subtitle = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontSize: "14px",
}));

const HeaderControls = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: theme.spacing(1),
}));

type CategoryHeaderProps = {
  title: string;
  subtitle: string;
  count: number;
  countSingularLabel?: string;
  countPluralLabel?: string;
};

export const CategoryHeader = ({
  title,
  subtitle,
  count,
  countSingularLabel = "game",
  countPluralLabel = "games",
}: CategoryHeaderProps): JSX.Element => {
  const navigate = useNavigate();
  const label = count === 1 ? countSingularLabel : countPluralLabel;

  return (
    <HeaderRow>
      <HeaderCopy>
        <Title variant="h1">{title}</Title>
        <Subtitle>{subtitle}</Subtitle>
      </HeaderCopy>
      <HeaderControls>
        <CustomSortButton variant="outlined" onClick={() => navigate(urls.toHub())}>
          Back to Hub
        </CustomSortButton>
        <SummaryChip label={`${count} ${label}`} size="small" />
      </HeaderControls>
    </HeaderRow>
  );
};
