import React, { JSX, useState } from "react";

import { MultiplayerDirectorySettings } from "@providers/editors/MultiplayerSettingsProvider.ts";
import { EditorProps } from "@modules/create/game-editor/editors/EditorType";

import {
  ButtonGroup,
  IconButton,
  List,
  ListItemButton,
  ListItemText
} from "@mui/material";

export const MultiplayerSettingsEditor: React.FC<EditorProps> = ({ project }) => {
  const createNodeEntry = (name: string, settings: MultiplayerDirectorySettings): JSX.Element => {
    const [isNodeOpened, setNodeOpened] = useState(false);

    const handleNodeToggle = (): void => {
      setNodeOpened(!isNodeOpened);
    };

    return (
      <ListItemButton onClick={handleNodeToggle}>
        <ListItemText>{name}</ListItemText>
        <ButtonGroup size="small">
          {/* FIXME: Use proper icons */}
          <IconButton>Add</IconButton>
          <IconButton>Remove</IconButton>
          <IconButton>Rename</IconButton>
        </ButtonGroup>
      </ListItemButton>
    );
  };

  return (
    <List>
      {}
    </List>
  );
};
