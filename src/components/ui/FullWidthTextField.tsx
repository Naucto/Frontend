import React from "react";
import { TextField, TextFieldProps } from "@mui/material";

type FullWidthTextFieldProps = Omit<TextFieldProps, "fullWidth" | "variant" | "margin">;

export const FullWidthTextField: React.FC<FullWidthTextFieldProps> = (props) => {
  return (
    <TextField
      fullWidth
      variant="outlined"
      margin="normal"
      {...props}
    />
  );
};
