import { Button, Chip } from "@mui/material";
import { alpha, styled } from "@mui/material/styles";

export const SummaryChip = styled(Chip)(({ theme }) => ({
  backgroundColor: alpha(theme.palette.common.white, 0.08),
  color: theme.palette.common.white,
  border: `1px solid ${alpha(theme.palette.common.white, 0.12)}`,
}));

export const CustomSortButton = styled(Button)(({ theme }) => ({
  borderColor: alpha(theme.palette.common.white, 0.18),
  color: theme.palette.common.white,
  backgroundColor: alpha(theme.palette.gray[900], 0.42),
  "&:hover": {
    borderColor: alpha(theme.palette.common.white, 0.3),
    backgroundColor: alpha(theme.palette.gray[900], 0.55),
  },
}));
