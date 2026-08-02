import React from "react";

import { styled } from "@mui/material";
import Button from "@mui/material/Button";

type Props = React.ComponentProps<typeof Button>;

const StyledImportantButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.red[500],
  color: theme.palette.common.white,
}));

const ImportantButton: React.FC<Props> = (props) => {
  return <StyledImportantButton {...props} />;
};

export default ImportantButton;
