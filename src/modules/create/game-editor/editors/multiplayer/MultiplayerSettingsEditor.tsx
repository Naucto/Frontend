import React, { JSX, useState } from "react";

import { MultiplayerDirectorySettings } from "@providers/editors/MultiplayerSettingsProvider.ts";
import { EditorProps } from "@modules/create/game-editor/editors/EditorType";

import {
  ButtonGroup,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText
} from "@mui/material";

export const MultiplayerSettingsEditor: React.FC<EditorProps> = ({ project }) => {
  const createNodeEntry = (settings: MultiplayerDirectorySettings, name: string): JSX.Element => {
    const [isNodeOpened, setNodeOpened] = useState(false);

    const handleNodeToggle = (): void => {
      setNodeOpened(!isNodeOpened);
    };

    return (
      <List>
        <ListItem
          disablePadding
          secondaryAction={
            <ListItemButton onClick={handleNodeToggle}>
              <ListItemText>{name}</ListItemText>
              <ButtonGroup size="small">
                {/* FIXME: Use proper icons */}
                <IconButton>Add</IconButton>
                <IconButton>Remove</IconButton>
                <IconButton>Rename</IconButton>
                <IconButton>ClientAccess</IconButton>
                <IconButton>ServerAccess</IconButton>
              </ButtonGroup>
            </ListItemButton>
          }>
          {(() => {
            if (!isNodeOpened)
              return null;

            const childNodes: JSX.Element[] = [];

            project.multiplayerSettingsProvider.visitDirectorySettings(
              (childSettings: MultiplayerDirectorySettings, childPath: string) =>
                childNodes.push(createNodeEntry(childSettings, childPath))
            );

            return childNodes;
          })()}
        </ListItem>
      </List>
    );
  };

  const rootNode = project.multiplayerSettingsProvider.getRootDirectorySettings();

  return (
    <List>
      {createNodeEntry(rootNode, "")}
    </List>
  );
};
