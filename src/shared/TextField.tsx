import React from "react";
import InputBase, { InputBaseProps } from "@mui/material/InputBase";
import { styled } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";

const StyledInput = styled(InputBase)(({ theme }) => ({
  width: "100%",
  padding: theme.spacing(1.5, 2),
  fontSize: 16,
  borderRadius: theme.custom.rounded.md,
  backgroundColor: theme.palette.background.default,
  color: theme.palette.text.primary,
  border: `2px solid ${theme.border.color.gray}`,
  transition: "border-color 0.2s",

  "&:hover": {
    borderColor: theme.palette.gray1
  },

  "&.Mui-focused": {
    borderColor: theme.palette.gray1,
  },

  "& input": {
    outline: "none",
    "&:-webkit-autofill": {
      boxShadow: "0 0 0 1000px transparent inset",
      WebkitBoxShadow: "0 0 0 1000px transparent inset",
      WebkitTextFillColor: theme.palette.text.primary,
      transition: "background-color 5000s ease-in-out 0s",
    },
  },
}));

type GenericTextFieldProps = InputBaseProps;

const GenericTextField: React.FC<GenericTextFieldProps> = (props) => {
  return (
    <StyledInput fullWidth {...props} />
  );
};

export default GenericTextField;
