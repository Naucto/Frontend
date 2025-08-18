import React, { useState } from "react";
import { EditorProps } from "../EditorType.ts";
import { styled } from "@mui/material/styles";
import { useProject } from "src/providers/ProjectProvider";
import { MapViewport } from "./MapViewport";

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

const Bottom = styled("div")(({ theme }) => ({
  flex: 0.4,
  display: "flex",
  borderRadius: theme.spacing(1),
  backgroundColor: theme.palette.blue[700],
}));

export const MapEditor: React.FC<EditorProps> = ({ ydoc, provider, onGetData, onSetData }) => {
  const { project } = useProject();
  if (!project) return <div>Loading...</div>;

  const [selectedIndex, setSelectedIndex] = useState<number>(13);

  return (
    <MapEditorContainer>
      <MapViewport selectedIndex={selectedIndex} />
      <Bottom>
        <input
          type="number"
          value={selectedIndex}
          onChange={(e) => setSelectedIndex(Number(e.target.value))}
        />
      </Bottom>
    </MapEditorContainer>
  );
};
