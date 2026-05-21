import {
  MultiplayerDirectoryFlags,
  MultiplayerDirectorySettings,
  MultiplayerSettingsProvider,
  MultiplayerSettingsUpdateListener
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

import React, { JSX, useEffect, useState } from "react";

interface MultiplayerDirectoryEntryButtonGroupProps {
  multiplayerSettingsProvider: MultiplayerSettingsProvider,
  settings: MultiplayerDirectorySettings
};

enum MultiplayerDirectoryEntryState {
  NORMAL,
  EDIT,
  DELETE,
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

  useEffect(
    () => {
      Object.entries(normal_flagStates).forEach(
        ([key, value]) => settings.set(
          enumFromName(MultiplayerDirectoryFlags, key),
          value
        )
      );
    },
    [normal_flagStates]
  );

  // "Edit" state specific things
  const edit_newNodePath = useInputValue(settings.path);

  // "Create child" state specific things
  const createChild_newNodePath =
    useInputValue(`${settings.path}.`);

  const normalState = (): JSX.Element => {
    const addChildNode = (): void => {
      setEntryState(MultiplayerDirectoryEntryState.CREATE_CHILD);
    };

    const deleteThisNode = (): void => {
      setEntryState(MultiplayerDirectoryEntryState.DELETE);
    };

    const renameThisNode = (): void => {
      setEntryState(MultiplayerDirectoryEntryState.EDIT);
    };

    return (
      <StyledButtonGroup>
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

        <Tooltip title="Add child node">
          <IconButton onClick={addChildNode}>
            <AddIcon />
          </IconButton>
        </Tooltip>

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

  const deleteState = (): JSX.Element => {
    const cancel = (): void => {
      setEntryState(MultiplayerDirectoryEntryState.NORMAL);
    };

    const validateChange = (): void => {
      mpsp.deleteDirectorySettings(settings.path);
      setEntryState(MultiplayerDirectoryEntryState.NORMAL);
    };

    return (
      <StyledButtonGroup>
        <Tooltip title="Cancel deletition">
          <IconButton onClick={cancel}>
            <CloseIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Delete this node, for sure">
          <IconButton onClick={validateChange} color="error">
            <DeleteIcon />
          </IconButton>
        </Tooltip>
      </StyledButtonGroup>
    );
  };

  const createChildState = (): JSX.Element => {
    const {
      value: newNodePath,
      onChange: newNodePath_onChange,
      setInput: newNodePath_setInput
    } = createChild_newNodePath;

    const cancel = (): void => {
      setEntryState(MultiplayerDirectoryEntryState.NORMAL);
    };

    const validateChange = (): void => {
      mpsp.createDirectorySettings(createChild_newNodePath.value);
      newNodePath_setInput(`${settings.path}.`);
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
      case MultiplayerDirectoryEntryState.DELETE:       return deleteState();
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
  const mpsp = multiplayerSettingsProvider;

  const [childrenEntries, setChildrenEntries] = useState<MultiplayerDirectorySettings[]>([]);

  const [isNodeOpened, setNodeOpened] = useState(settings.isRootNode);

  const getNodeEntries = (): Array<MultiplayerDirectorySettings> => {
    const newChildrenSet: Array<MultiplayerDirectorySettings> = [];

    mpsp.visitChildDirectorySettings(settings.path, (childNode) => {
      newChildrenSet.push(childNode);
    });

    return newChildrenSet;
  };

  useEffect(
    () => {
      if (!isNodeOpened) {
        setChildrenEntries([]);
        mpsp.unobserve(settings.path);

        return;
      }

      const observeCallback: MultiplayerSettingsUpdateListener = (action, updatedSettings) => {
        switch (action) {
          case "add":
          {
            setChildrenEntries(
              prevArray => [...prevArray, updatedSettings]
            );
            break;
          }

          case "delete":
          {
            setChildrenEntries(
              prevArray =>
                prevArray.filter(entry =>
                  entry.path === updatedSettings.path)
            );
            break;
          }

          case "update":
          {
            setChildrenEntries(
              prevArray =>
                prevArray.map(entry =>
                  entry.path === updatedSettings.path ? updatedSettings : entry)
            );
            break;
          }
        }
      };

      setChildrenEntries(getNodeEntries());
      mpsp.observe(settings.path, observeCallback);

      return () => mpsp.unobserve(settings.path);
    },
    [isNodeOpened]
  );

  const handleNodeToggle = (): void => {
    setNodeOpened(prev => !prev);
  };

  return (
    <>
      <ListItemButton onClick={handleNodeToggle}>
        <ListItemIcon>
          {isNodeOpened ? <ExpandMoreIcon /> : <ExpandLessIcon />}
        </ListItemIcon>
        <ListItemText primary={settings.name} />
        <ListItemIcon>
          <MultiplayerDirectoryEntryButtonGroup
            multiplayerSettingsProvider={multiplayerSettingsProvider}
            settings={settings} />
        </ListItemIcon>
      </ListItemButton>

      <Collapse in={isNodeOpened} unmountOnExit>
        <List sx={{ pl: 4 }}>
          {childrenEntries.map(childSettings => (
            <MultiplayerDirectoryEntry
              key={childSettings.path}
              settings={childSettings}
              multiplayerSettingsProvider={multiplayerSettingsProvider} />
          ))}
        </List>
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
