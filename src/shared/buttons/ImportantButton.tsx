import React from "react";
import Button from "@mui/material/Button";
import { styled } from "@mui/material";

type Props = React.ComponentProps<typeof Button>;

const StyledImportantButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.red[500],
  color: theme.palette.common.white,
}));

const ImportantButton: React.FC<Props> = (props) => {
  return <StyledImportantButton {...props} />;
};

export default ImportantButton;
