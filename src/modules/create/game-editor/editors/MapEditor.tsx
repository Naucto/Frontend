import React from "react";
import { EditorProps } from "./EditorType.ts";
import { styled } from "@mui/material/styles";
import { useProject } from "src/providers/ProjectProvider";

const MapEditorContainer = styled("div")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  borderRadius: theme.spacing(1),
  borderTopLeftRadius: 0,
  backgroundColor: theme.palette.blue[800],
  gap: theme.spacing(1),
  boxSizing: "border-box",
  padding: theme.spacing(1),
}));

const Top = styled("div")(({ theme }) => ({
  flex: 0.6,
  display: "flex",
  borderRadius: theme.spacing(1),
  backgroundColor: theme.palette.blue[700],

}));
const Bottom = styled("div")(({ theme }) => ({
  flex: 0.4,
  display: "flex",
  borderRadius: theme.spacing(1),
  backgroundColor: theme.palette.blue[700],
}));

export const MapEditor: React.FC<EditorProps> = () => {
  const { project } = useProject();
  if (!project) {
    return <div>Loading...</div>;
  }

  return (
    <MapEditorContainer>
      <Top />
      <Bottom />
    </MapEditorContainer >
  );
};
