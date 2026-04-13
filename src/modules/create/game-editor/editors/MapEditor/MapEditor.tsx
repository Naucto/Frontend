import React, { useState } from "react";
import { EditorProps } from "../EditorType.ts";
import { styled } from "@mui/material/styles";
import { Box } from "@mui/material";
import { MapViewport } from "./MapViewport";
import { SpritePicker } from "./SpritePicker";

const MapEditorInner = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  backgroundColor: theme.palette.blue[500],
  gap: theme.spacing(1),
  boxSizing: "border-box",
}));

const Bottom = styled("div")(({ theme }) => ({
  flex: 0.4,
  display: "flex",
  borderRadius: theme.spacing(1),
  backgroundColor: theme.palette.blue[700],
}));

export const MapEditor: React.FC<EditorProps> = ({ project }) => {
  if (!project) return <div>Loading...</div>;
  const [selectedIndex, setSelectedIndex] = useState(13);

  return (
    <MapEditorInner data-cy="map-editor">
      <MapViewport selectedIndex={selectedIndex} project={project} />
      <Bottom>
        <SpritePicker selectedIndex={selectedIndex} onSelect={setSelectedIndex} project={project} />
      </Bottom>
    </MapEditorInner>
  );
};
