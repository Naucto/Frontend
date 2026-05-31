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
  Alert,
  AlertTitle,
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

import React, { JSX, useEffect, useState } from "react";

const StyledButtonGroup = styled(ButtonGroup)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(0.5),
}));

interface DeleteNodeDialogProps {
  path: string | null;
  onClose: () => void;
  onConfirm: (path: string) => void;
}

const DeleteNodeDialog: React.FC<DeleteNodeDialogProps> = ({ path, onClose, onConfirm }) => (
  <Dialog
    open={path !== null}
    onClose={onClose}
    maxWidth="sm"
    fullWidth
    role="alertdialog"
  >
    <DialogTitle>Delete node</DialogTitle>
    <DialogContent>
      <DialogContentText>
        Are you sure you want to delete node <strong>{path}</strong> and its children?
      </DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Cancel</Button>
      <Button onClick={() => onConfirm(path!)} color="error" autoFocus>
        Delete
      </Button>
    </DialogActions>
  </Dialog>
);

interface CreateChildNodeDialogProps {
  parentPath: string | null;
  onClose: () => void;
  onConfirm: (path: string) => void;
  multiplayerSettingsProvider: MultiplayerSettingsProvider;
}

const CreateChildNodeDialog: React.FC<CreateChildNodeDialogProps> = ({ parentPath, onClose, onConfirm, multiplayerSettingsProvider }) => {
  const [inputValue, setInputValue] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (parentPath !== null) {
      setInputValue(parentPath === "" ? "" : `${parentPath}.`);
      setTouched(false);
    }
  }, [parentPath]);

  const isFormatValid = multiplayerSettingsProvider.validateDirectorySettingsPath(inputValue);
  const exists = multiplayerSettingsProvider.doesDirectorySettingsPathExist(inputValue);
  const isValid = isFormatValid && !exists && inputValue !== "" && inputValue !== `${parentPath}.`;

  let helperText = "";
  if (touched) {
    if (!isFormatValid) helperText = "Invalid path format";
    else if (exists) helperText = "A node with this path already exists";
  }

  return (
    <Dialog
      open={parentPath !== null}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Create child node</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Permissions are configurable after instantiating the node.
        </DialogContentText>

        <TextField
          autoFocus
          label="Child node name"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setTouched(true);
          }}
          placeholder={parentPath === "" ? "node" : `${parentPath}.node`}
          fullWidth
          error={touched && (!isFormatValid || exists)}
          helperText={helperText}
        />

        <Alert severity="info" sx={{ mt: 2 }}>
          <AlertTitle>Tip</AlertTitle>
          You can also add further children to this new node once it is created.
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => onConfirm(inputValue)} disabled={!isValid} autoFocus>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
};

interface RenameNodeDialogProps {
  path: string | null;
  onClose: () => void;
  onConfirm: (oldPath: string, newPath: string) => void;
  multiplayerSettingsProvider: MultiplayerSettingsProvider;
}

const RenameNodeDialog: React.FC<RenameNodeDialogProps> = ({ path, onClose, onConfirm, multiplayerSettingsProvider }) => {
  const [inputValue, setInputValue] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (path !== null) {
      setInputValue(path);
      setTouched(false);
    }
  }, [path]);

  const isFormatValid = multiplayerSettingsProvider.validateDirectorySettingsPath(inputValue);
  const exists = inputValue !== path && multiplayerSettingsProvider.doesDirectorySettingsPathExist(inputValue);
  const isValid = isFormatValid && !exists && inputValue !== "" && inputValue !== path;

  let helperText = "";
  if (touched) {
    if (!isFormatValid) helperText = "Invalid path format";
    else if (exists) helperText = "A node with this path already exists";
  }

  return (
    <Dialog
      open={path !== null}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Rename node</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Renaming node <strong>{path}</strong>
        </DialogContentText>

        <TextField
          autoFocus
          label="New node path"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setTouched(true);
          }}
          fullWidth
          sx={{ mt: 2 }}
          error={touched && (!isFormatValid || exists)}
          helperText={helperText}
        />

        <Alert severity="info" sx={{ mt: 2 }}>
          <AlertTitle>Tip</AlertTitle>
          Changing the path will move this node and all its children to the new location.
        </Alert>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => onConfirm(path!, inputValue)} disabled={!isValid} autoFocus>
          Rename
        </Button>
      </DialogActions>
    </Dialog>
  );
};

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
  settings: MultiplayerDirectorySettings;
  onDeleteNode: (path: string) => void;
  onCreateChildNode: (path: string) => void;
  onRenameNode: (path: string) => void;
};

export const MultiplayerDirectoryEntryActionSet: React.FC<MultiplayerDirectoryEntryActionSetProps> = ({
  settings,
  onDeleteNode,
  onCreateChildNode,
  onRenameNode
}) => {
  const normalState = (): JSX.Element => {
    const addChildNode = (): void => onCreateChildNode(settings.path);
    const deleteThisNode = (): void => onDeleteNode(settings.path);
    const renameThisNode = (): void => onRenameNode(settings.path);

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

interface MultiplayerDirectoryEntryProps {
  settings: MultiplayerDirectorySettings;
  multiplayerSettingsProvider: MultiplayerSettingsProvider;
  onDeleteNode: (path: string) => void;
  onCreateChildNode: (path: string) => void;
  onRenameNode: (path: string) => void;
};

export const MultiplayerDirectoryEntry: React.FC<MultiplayerDirectoryEntryProps> = ({
  settings,
  multiplayerSettingsProvider,
  onDeleteNode,
  onCreateChildNode,
  onRenameNode
}) => {
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

      return () => mpsp.unobserve(settings.path, observeCallback);
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
            settings={settings}
            onDeleteNode={onDeleteNode}
            onCreateChildNode={onCreateChildNode}
            onRenameNode={onRenameNode} />
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
          multiplayerSettingsProvider={multiplayerSettingsProvider}
          onDeleteNode={onDeleteNode}
          onCreateChildNode={onCreateChildNode}
          onRenameNode={onRenameNode} />
      ))}
    </>
  );
};

export const MultiplayerSettingsEditor: React.FC<EditorProps> = ({ project }) => {
  const mpsp = project.multiplayerSettingsProvider;
  const rootNode = mpsp.getRootDirectorySettings();

  const [deletePath, setDeletePath] = useState<string | null>(null);
  const [createChildPath, setCreateChildPath] = useState<string | null>(null);
  const [renamePath, setRenamePath] = useState<string | null>(null);

  return (
    <>
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
              multiplayerSettingsProvider={mpsp}
              onDeleteNode={setDeletePath}
              onCreateChildNode={setCreateChildPath}
              onRenameNode={setRenamePath}
            />
          </TableBody>
        </StyledTable>
      </TableContainer>

      <DeleteNodeDialog
        path={deletePath}
        onClose={() => setDeletePath(null)}
        onConfirm={(path) => {
          mpsp.deleteDirectorySettings(path);
          setDeletePath(null);
        }}
      />

      <CreateChildNodeDialog
        parentPath={createChildPath}
        onClose={() => setCreateChildPath(null)}
        onConfirm={(newPath) => {
          mpsp.createDirectorySettings(newPath);
          setCreateChildPath(null);
        }}
        multiplayerSettingsProvider={mpsp}
      />

      <RenameNodeDialog
        path={renamePath}
        onClose={() => setRenamePath(null)}
        onConfirm={(oldPath, newPath) => {
          mpsp.renameDirectorySettings(oldPath, newPath);
          setRenamePath(null);
        }}
        multiplayerSettingsProvider={mpsp}
      />
    </>
  );
};

