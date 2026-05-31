import {
  MultiplayerDirectoryFlags,
  MultiplayerDirectorySettings,
  MultiplayerSettingsProvider,
  MultiplayerSettingsUpdateListener
} from "@providers/editors/MultiplayerSettingsProvider.ts";
import { EditorProps } from "@modules/create/game-editor/editors/EditorType";

import { enumFromName, enumNames } from "@our-types/enum";
import { useInputValue } from "@hooks/useInputValue";

import {
  styled,
  ButtonGroup,
  Checkbox,
  IconButton,
  Tooltip,
  TextField,
  TableContainer,
  TableHead,
  TableBody,
  TableRow,
} from "@mui/material";

import {
  StyledTable,
  StyledTableRow,
  StyledTableCell,
  StyledGrownTableCell,
} from "@components/ui/StyledTable.tsx";

import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import RenameIcon from "@mui/icons-material/Edit";
import CloseIcon from "@mui/icons-material/Close";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SubdirectoryArrowRightIcon from "@mui/icons-material/SubdirectoryArrowRight";

import React, { JSX, useEffect, useState } from "react";

enum MultiplayerDirectoryEntryState {
  NORMAL,
  EDIT,
  DELETE,
  CREATE_CHILD
};

const StyledButtonGroup = styled(ButtonGroup)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(0.5),
}));

interface MultiplayerDirectoryEntryPermissionsSetProps {
  multiplayerSettingsProvider: MultiplayerSettingsProvider,
  settings: MultiplayerDirectorySettings
};

export const MultiplayerDirectoryEntryPermissionsSet: React.FC<MultiplayerDirectoryEntryPermissionsSetProps> = ({ multiplayerSettingsProvider, settings }) => {
  const mpsp = multiplayerSettingsProvider;

  type DirectoryFlagsRecord = Record<string, boolean>;

  const getFlagStates = (): Record<string, boolean> => {
    const updatedSettings = mpsp.getDirectorySettings(settings.path)!;

    return normal_flagNames.reduce(
      (record, flagName) => {
        record[flagName] = updatedSettings.can(enumFromName(MultiplayerDirectoryFlags, flagName));
        return record;
      },
      {} as DirectoryFlagsRecord
    );
  };

  const normal_flagNames = enumNames(MultiplayerDirectoryFlags);
  const [normal_flagStates, normal_setFlagStates] = useState<DirectoryFlagsRecord>(getFlagStates());

  const normal_observeCallback: MultiplayerSettingsUpdateListener = (action, updatedSettings) => {
    if (updatedSettings.path !== settings.path) {
      // We only care about ourselves, not children
      return;
    }
    else if (action !== "update") {
      // We also only care about changes, notably on the checkbox set
      return;
    }

    normal_setFlagStates(getFlagStates());
  };

  useEffect(
    () => {
      mpsp.observe(settings.path, normal_observeCallback);
      return () => mpsp.unobserve(settings.path, normal_observeCallback);
    }
  );

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <StyledButtonGroup>
        {
          normal_flagNames.map((flagName) => {
            const flagUpdate = (_: React.ChangeEvent, checked: boolean): void => {
              mpsp.accessDirectorySettings(settings.path,
                (settings) => settings.set(
                  enumFromName(MultiplayerDirectoryFlags, flagName),
                  checked
                )
              );
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
    </span>
  );
};

interface MultiplayerDirectoryEntryActionSetProps {
  multiplayerSettingsProvider: MultiplayerSettingsProvider,
  settings: MultiplayerDirectorySettings
};

export const MultiplayerDirectoryEntryActionSet: React.FC<MultiplayerDirectoryEntryActionSetProps> = ({ multiplayerSettingsProvider, settings }) => {
  const mpsp = multiplayerSettingsProvider;

  const [entryState, setEntryState] = useState(MultiplayerDirectoryEntryState.NORMAL);

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

  const observeCallback: MultiplayerSettingsUpdateListener = (action, updatedSettings) => {
    if (updatedSettings.path === settings.path) {
      // We only care about children, not ourselves
      return;
    }

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
              entry.path !== updatedSettings.path)
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

  useEffect(
    () => {
      if (!isNodeOpened) {
        setChildrenEntries([]);
        mpsp.unobserve(settings.path, observeCallback);

        return;
      }

      setChildrenEntries(getNodeEntries());
      mpsp.observe(settings.path, observeCallback);

      return () => mpsp.unobserve(settings.path);
    },
    [isNodeOpened]
  );

  const handleNodeToggle = (): void => {
    setNodeOpened(prev => !prev);
  };

  const nodeDepth = mpsp.getPathDepth(settings.path);
  let   doesNodeHaveChildren = false;

  mpsp.visitChildDirectorySettings(settings.path, () => doesNodeHaveChildren = true);

  return (
    <>
      <StyledTableRow hoverable={doesNodeHaveChildren} onClick={handleNodeToggle}>
        <StyledTableCell sx={{ pl: (nodeDepth + .2) * 4 }}>
          {doesNodeHaveChildren
            ? (isNodeOpened ? <ExpandMoreIcon /> : <ExpandLessIcon />)
            : <SubdirectoryArrowRightIcon />}
        </StyledTableCell>
        <StyledTableCell>
          <MultiplayerDirectoryEntryActionSet
            multiplayerSettingsProvider={multiplayerSettingsProvider}
            settings={settings} />
        </StyledTableCell>
        <StyledGrownTableCell>
          {settings.name}
        </StyledGrownTableCell>
        <StyledTableCell>
          <MultiplayerDirectoryEntryPermissionsSet
            multiplayerSettingsProvider={multiplayerSettingsProvider}
            settings={settings} />
        </StyledTableCell>
      </StyledTableRow>

      {isNodeOpened && childrenEntries.map(childSettings => (
        <MultiplayerDirectoryEntry
          key={childSettings.path}
          settings={childSettings}
          multiplayerSettingsProvider={multiplayerSettingsProvider} />
      ))}
    </>
  );
};

export const MultiplayerSettingsEditor: React.FC<EditorProps> = ({ project }) => {
  const rootNode = project.multiplayerSettingsProvider.getRootDirectorySettings();

  return (
    <TableContainer>
      <StyledTable>
        <TableHead>
          <TableRow>
            <StyledTableCell />
            <StyledTableCell>Operations</StyledTableCell>
            <StyledTableCell>Node Path</StyledTableCell>
            <StyledTableCell>Permissions</StyledTableCell>
          </TableRow>
        </TableHead>

        <TableBody>
          <MultiplayerDirectoryEntry
            key={rootNode.path}
            settings={rootNode}
            multiplayerSettingsProvider={project.multiplayerSettingsProvider} />
        </TableBody>
      </StyledTable>
    </TableContainer>
  );
};
