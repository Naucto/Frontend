import React, { JSX, useState } from "react";

import {
  MultiplayerDirectoryFlags,
  MultiplayerDirectorySettings,
  MultiplayerSettingsProvider
} from "@providers/editors/MultiplayerSettingsProvider.ts";
import { EditorProps } from "@modules/create/game-editor/editors/EditorType";

import {
  ButtonGroup,
  Checkbox,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText
} from "@mui/material";

import { enumFromName } from "@our-types/enum";

interface MultiplayerEntryButtonGroupProps {
  multiplayerSettingsProvider: MultiplayerSettingsProvider,
  path: string,
  settings: MultiplayerDirectorySettings
};

export const MultiplayerEntryButtonGroup: React.FC<MultiplayerEntryButtonGroupProps> = ({ multiplayerSettingsProvider, path, settings }) => {
  const mpsp = multiplayerSettingsProvider;

  const flagNames = Object.keys(MultiplayerDirectoryFlags)
    .filter(value => Number.isNaN(Number(value)) && value !== "NONE");

  return (
    <ButtonGroup size="small">
      {/* FIXME: Use proper icons */}
      <IconButton>Add</IconButton>
      <IconButton>Remove</IconButton>
      <IconButton>Rename</IconButton>

      {
        flagNames.map((flagName) => {
          const flagValue: MultiplayerDirectoryFlags = enumFromName(MultiplayerDirectoryFlags, flagName);

          const flagUpdate = (checked: boolean): void =>
            mpsp.accessDirectorySettings(path,
              (settings) => settings.set(flagValue, checked));

          return (
            <Checkbox
              key={flagName}
              checked={settings.can(flagValue)}
              onChange={(_, checked) => flagUpdate(checked)}
              title={flagName} />
          );
        })
      }
    </ButtonGroup>
  );
};

export const MultiplayerSettingsEditor: React.FC<EditorProps> = ({ project }) => {
  const createNodeEntry = (settings: MultiplayerDirectorySettings, path: string): JSX.Element => {
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
              <ListItemText>{path}</ListItemText>
              <MultiplayerEntryButtonGroup
                multiplayerSettingsProvider={project.multiplayerSettingsProvider}
                path={path}
                settings={settings} />
            </ListItemButton>
          }>
          {(() => {
            if (!isNodeOpened)
              return null;

            return project.multiplayerSettingsProvider.visitChildDirectorySettings(
              "",
              (childSettings: MultiplayerDirectorySettings, childPath: string) =>
                createNodeEntry(childSettings, childPath)
            );
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
