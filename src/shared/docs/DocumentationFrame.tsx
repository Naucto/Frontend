import React from "react";
import { styled } from "@mui/material/styles";

export const DOCUMENTATION_URL = import.meta.env.VITE_DOCS_URL ?? "https://docs.naucto.net";

const Frame = styled("iframe")(({ theme }) => ({
  width: "100%",
  minHeight: "100%",
  border: "none",
  borderRadius: theme.custom.rounded.md,
  backgroundColor: theme.palette.blue[500],
}));

type DocumentationFrameProps = Omit<React.ComponentPropsWithoutRef<"iframe">, "src" | "title">;

export const DocumentationFrame: React.FC<DocumentationFrameProps> = (props) => {
  return (
    <Frame
      src={DOCUMENTATION_URL}
      title="Naucto Documentation"
      {...props}
    />
  );
};
