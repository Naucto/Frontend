import {
  MultiplayerDirectoryFlags,
  MultiplayerDirectorySettings,
  MultiplayerSettingsProvider,
  MultiplayerSettingsUpdateListener
} from "@providers/editors/MultiplayerSettingsProvider.ts";
import { EditorProps } from "@modules/create/game-editor/editors/EditorType";

import { enumFromName, enumNames } from "@our-types/enum";

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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
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
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SubdirectoryArrowRightIcon from "@mui/icons-material/SubdirectoryArrowRight";

import React, { JSX, useEffect, useState, useContext } from "react";

const StyledButtonGroup = styled(ButtonGroup)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(0.5),
}));

// --------------------------------------------------------------------------
// Dialog manager context (shared across all rows)
// --------------------------------------------------------------------------

type MultiplayerDialogType = "delete" | "createChild" | "rename";

interface MultiplayerDialogManagerState {
  type: MultiplayerDialogType | null;
  open: boolean;
  path: string;
  inputValue: string;
}

interface MultiplayerDialogManagerContextValue {
  state: MultiplayerDialogManagerState;
  openDialog: (type: MultiplayerDialogType, path: string) => void;
  closeDialog: () => void;
  setDialogInputValue: (value: string) => void;
}

const MultiplayerDialogManagerContext = React.createContext<MultiplayerDialogManagerContextValue | null>(null);

const useMultiplayerDialogManager = (): MultiplayerDialogManagerContextValue => {
  const ctx = useContext(MultiplayerDialogManagerContext);
  if (!ctx) throw new Error("useMultiplayerDialogManager must be used within MultiplayerDialogManagerProvider");
  return ctx;
};

interface MultiplayerDialogManagerProviderProps {
  children: JSX.Element;
  multiplayerSettingsProvider: MultiplayerSettingsProvider;
}

const MultiplayerDialogManagerProvider: React.FC<MultiplayerDialogManagerProviderProps> = ({ children, multiplayerSettingsProvider }) => {
  const mpsp = multiplayerSettingsProvider;

  const [state, setState] = useState<MultiplayerDialogManagerState>({ type: null, open: false, path: "", inputValue: "" });

  const openDialog = (type: MultiplayerDialogType, path: string): void => {
    const initialInputValue = type === "createChild" ? `${path}.` : path;
    setState({ type, open: true, path, inputValue: initialInputValue });
  };

  const closeDialog = (): void => {
    setState({ type: null, open: false, path: "", inputValue: "" });
  };

  const setDialogInputValue = (value: string): void => {
    setState(prev => ({ ...prev, inputValue: value }));
  };

  return (
    <MultiplayerDialogManagerContext.Provider value={{ state, openDialog, closeDialog, setDialogInputValue }}>
      {children}
      {state.type === "delete" && state.open && (
        <Dialog
          open={state.open}
          onClose={closeDialog}
          maxWidth="sm"
          fullWidth
          role="alertdialog"
        >
          <DialogTitle>Delete node</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to delete node <strong>{state.path}</strong> and its children?
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => {
              mpsp.deleteDirectorySettings(state.path);
              closeDialog();
            }} color="error" autoFocus>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      )}
      {state.type === "createChild" && state.open && (
        <Dialog
          open={state.open}
          onClose={closeDialog}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Create child node</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              label="Child node name"
              value={state.inputValue}
              onChange={(e) => setDialogInputValue(e.target.value)}
              placeholder={`${state.path}.`}
              fullWidth
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => {
              mpsp.createDirectorySettings(state.inputValue);
              closeDialog();
            }} autoFocus>
              Create
            </Button>
          </DialogActions>
        </Dialog>
      )}
      {state.type === "rename" && state.open && (
        <Dialog
          open={state.open}
          onClose={closeDialog}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>Rename node</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Renaming node <strong>{state.path}</strong>
            </DialogContentText>
            <TextField
              autoFocus
              label="New node path"
              value={state.inputValue}
              onChange={(e) => setDialogInputValue(e.target.value)}
              fullWidth
              sx={{ mt: 2 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => {
              // TODO: Implement rename API call here
              closeDialog();
            }} autoFocus>
              Rename
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </MultiplayerDialogManagerContext.Provider>
  );
};

// --------------------------------------------------------------------------
// Permissions set (unchanged)
// --------------------------------------------------------------------------

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

// --------------------------------------------------------------------------
// Action set (refactored: uses shared dialog manager, no inline dialogs)
// --------------------------------------------------------------------------

interface MultiplayerDirectoryEntryActionSetProps {
  settings: MultiplayerDirectorySettings
};

export const MultiplayerDirectoryEntryActionSet: React.FC<MultiplayerDirectoryEntryActionSetProps> = ({ settings }) => {
  const { openDialog } = useMultiplayerDialogManager();

  const normalState = (): JSX.Element => {
    const addChildNode = (): void => openDialog("createChild", settings.path);
    const deleteThisNode = (): void => openDialog("delete", settings.path);
    const renameThisNode = (): void => openDialog("rename", settings.path);

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

  return (
    <span onClick={(e) => e.stopPropagation()}>
      {normalState()}
    </span>
  );
};

// --------------------------------------------------------------------------
// Directory entry (unchanged structure, uses refactored ActionSet)
// --------------------------------------------------------------------------

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
              entry.path === updatedSettings.path ? updatedSettings : entry
            )
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

// --------------------------------------------------------------------------
// Editor (refactored: wraps table in dialog provider, renders dialogs top-level)
// --------------------------------------------------------------------------

export const MultiplayerSettingsEditor: React.FC<EditorProps> = ({ project }) => {
  const rootNode = project.multiplayerSettingsProvider.getRootDirectorySettings();

  return (
    <MultiplayerDialogManagerProvider
      multiplayerSettingsProvider={project.multiplayerSettingsProvider}
    >
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
    </MultiplayerDialogManagerProvider>
  );
};
