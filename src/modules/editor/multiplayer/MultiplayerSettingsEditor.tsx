import {
  MultiplayerDirectoryFlags,
  MultiplayerDirectorySettings,
  MultiplayerSettingsProvider
} from "@providers/editors/MultiplayerSettingsProvider.ts";
import { EditorProps } from "@modules/create/game-editor/editors/EditorType";

import { Section } from "@components/ui/Section";

import { enumFromName, enumNames } from "@our-types/enum";
import { useInputValue } from "@hooks/useInputValue";

import {
  styled,
  ButtonGroup,
  Checkbox,
  List,
  ListItemText,
  IconButton,
  Tooltip,
  Collapse,
  TextField,
  ListItemButton,
  ListItemIcon,
} from "@mui/material";

import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import RenameIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import React, { JSX, useState } from "react";

interface MultiplayerDirectoryEntryButtonGroupProps {
  multiplayerSettingsProvider: MultiplayerSettingsProvider,
  settings: MultiplayerDirectorySettings
};

enum MultiplayerDirectoryEntryState {
  NORMAL,
  EDIT,
  CREATE_CHILD
};

const StyledButtonGroup = styled(ButtonGroup)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(1),
}));

export const MultiplayerDirectoryEntryButtonGroup: React.FC<MultiplayerDirectoryEntryButtonGroupProps> = ({ multiplayerSettingsProvider, settings }) => {
  const mpsp = multiplayerSettingsProvider;

  const [entryState, setEntryState] = useState(MultiplayerDirectoryEntryState.NORMAL);

  // "Normal" state specific things
  type DirectoryFlagsRecord = Record<string, boolean>;
  const normal_flagNames = enumNames(MultiplayerDirectoryFlags);
  const [normal_flagStates, normal_setFlagStates] =
    useState<DirectoryFlagsRecord>(
      normal_flagNames.reduce(
        (record, flagName) => {
          record[flagName] = settings.can(enumFromName(MultiplayerDirectoryFlags, flagName));
          return record;
        },
        {} as DirectoryFlagsRecord
      )
    );

  // "Edit" state specific things
  const edit_newNodePath = useInputValue(settings.path);

  // "Create child" state specific things
  const createChild_newNodePath =
    useInputValue(settings.isRootNode ? "" : `${settings.path}.`);

  const normalState = (): JSX.Element => {
    const addChildNode = (): void => {
      setEntryState(MultiplayerDirectoryEntryState.CREATE_CHILD);
    };

    const deleteThisNode = (): void => {

    };

    const renameThisNode = (): void => {
      setEntryState(MultiplayerDirectoryEntryState.EDIT);
    };

    return (
      <StyledButtonGroup>
        <Tooltip title="Add child node">
          <IconButton onClick={addChildNode}>
            <AddIcon />
          </IconButton>
        </Tooltip>

        {!settings.isRootNode && (
          <>
            <Tooltip title="Delete this node and its children">
              <IconButton onClick={deleteThisNode}>
                <DeleteIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title="Rename this node's path">
              <IconButton onClick={renameThisNode}>
                <RenameIcon />
              </IconButton>
            </Tooltip>
          </>
        )}

        {
          normal_flagNames.map((flagName) => {
            const flagUpdate = (_: React.ChangeEvent, checked: boolean): void => {
              mpsp.accessDirectorySettings(settings.path,
                (settings) => settings.set(enumFromName(MultiplayerDirectoryFlags, flagName), checked));

              normal_setFlagStates(prev => ({ ...prev, [flagName]: checked }));
            };

            return (
              <Tooltip title={flagName} key={flagName}>
                <Checkbox
                  checked={normal_flagStates[flagName]}
                  onChange={flagUpdate} />
              </Tooltip>
            );
          })
        }
      </StyledButtonGroup>
    );
  };

  const editState = (): JSX.Element => {
    const { value: newNodePath, onChange: newNodePath_onChange } = edit_newNodePath;

    const cancel = (): void => {
      setEntryState(MultiplayerDirectoryEntryState.NORMAL);
    };

    const validateChange = (): void => {
      console.log(newNodePath);
      setEntryState(MultiplayerDirectoryEntryState.NORMAL);
    };

    return (
      <StyledButtonGroup>
        <Tooltip title="New path of the node">
          <TextField
            variant="standard"
            size="small"
            hiddenLabel
            value={newNodePath}
            onChange={newNodePath_onChange} />
        </Tooltip>

        <Tooltip title="Cancel change">
          <IconButton onClick={cancel}>
            <CloseIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Rename this node">
          <IconButton onClick={validateChange}>
            <RenameIcon />
          </IconButton>
        </Tooltip>
      </StyledButtonGroup>
    );
  };

  const createChildState = (): JSX.Element => {
    const { value: newNodePath, onChange: newNodePath_onChange } = createChild_newNodePath;

    const cancel = (): void => {
      setEntryState(MultiplayerDirectoryEntryState.NORMAL);
    };

    const validateChange = (): void => {
      mpsp.createDirectorySettings(createChild_newNodePath.value);
      setEntryState(MultiplayerDirectoryEntryState.NORMAL);
    };

    return (
      <StyledButtonGroup>
        <Tooltip title="New path of the node">
          <TextField
            variant="standard"
            size="small"
            hiddenLabel
            value={newNodePath}
            onChange={newNodePath_onChange} />
        </Tooltip>

        <Tooltip title="Cancel change">
          <IconButton onClick={cancel}>
            <CloseIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Create a new child node with this name">
          <IconButton onClick={validateChange}>
            <AddIcon />
          </IconButton>
        </Tooltip>
      </StyledButtonGroup>
    );
  };

  const entryStateContents = (): JSX.Element => {
    switch (entryState) {
      case MultiplayerDirectoryEntryState.NORMAL:       return normalState();
      case MultiplayerDirectoryEntryState.EDIT:         return editState();
      case MultiplayerDirectoryEntryState.CREATE_CHILD: return createChildState();
    }
  };

  return (
    <span onClick={(e) => e.stopPropagation()}>
      {entryStateContents()}
    </span>
  );
};

interface MultiplayerDirectoryEntryProps {
  settings: MultiplayerDirectorySettings;
  multiplayerSettingsProvider: MultiplayerSettingsProvider;
};

export const MultiplayerDirectoryEntry: React.FC<MultiplayerDirectoryEntryProps> = ({ settings, multiplayerSettingsProvider }) => {
  const [childrenEntries, setChildrenEntries] = useState<MultiplayerDirectorySettings[]>([]);

  const [isNodeOpened, setNodeOpened] = useState(settings.isRootNode);

  const handleNodeToggle = (): void => {
    setNodeOpened(!isNodeOpened);

    if (!isNodeOpened) {
      setChildrenEntries([]);
      return;
    }

    setChildrenEntries(
      multiplayerSettingsProvider.visitAllDirectorySettings(
        (childSettings: MultiplayerDirectorySettings) => {
          const calcPathDepth = (p: string): number => Number(p === "") + p.split(".").length;
          const parentPathDepth = calcPathDepth(settings.path);

          const childDepth = calcPathDepth(childSettings.path);

          if (!childSettings.path.startsWith(settings.path) ||
              childSettings.path === settings.path ||
              childDepth !== parentPathDepth + 1)
            return undefined;

          return childSettings;
        }
      )
    );
  };

  const pathDisplayName = settings.isRootNode ? "[root]" : settings.path;

  return (
    <>
      <ListItemButton onClick={handleNodeToggle}>
        <ListItemIcon>
          {isNodeOpened ? <ExpandMoreIcon /> : <ExpandLessIcon />}
        </ListItemIcon>
        <ListItemText primary={pathDisplayName} />
        <ListItemIcon>
          <MultiplayerDirectoryEntryButtonGroup
            multiplayerSettingsProvider={multiplayerSettingsProvider}
            settings={settings} />
        </ListItemIcon>
      </ListItemButton>

      <Collapse in={isNodeOpened} unmountOnExit>
        {childrenEntries.map(childSettings => (
          <MultiplayerDirectoryEntry
            key={childSettings.path}
            settings={childSettings}
            multiplayerSettingsProvider={multiplayerSettingsProvider} />
        ))}
      </Collapse>
    </>
  );
};

export const MultiplayerSettingsEditor: React.FC<EditorProps> = ({ project }) => {
  const rootNode = project.multiplayerSettingsProvider.getRootDirectorySettings();

  return (
    <Section>
      <List>
        <MultiplayerDirectoryEntry
          key={rootNode.path}
          settings={rootNode}
          multiplayerSettingsProvider={project.multiplayerSettingsProvider} />
      </List>
    </Section>
  );
};
