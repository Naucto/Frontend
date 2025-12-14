import React, { useState, useEffect } from "react";
import { EditorProps } from "./EditorType";
import { Box, Button, Typography, List, ListItem, ListItemText, Paper, Divider, Chip } from "@mui/material";
import { styled } from "@mui/material/styles";
import { ApiError, ProjectsService, ProjectWithRelationsResponseDto, UserBasicInfoDto, } from "@api";
import { ProjectSettings } from "@providers/editors/ProjectSettingsProvider";
import { ActionButton } from "@components/ui/ActionButton";
import { FullWidthTextField } from "@components/ui/FullWidthTextField";

const EditorContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  backgroundColor: theme.palette.blue[500],
}));

const Section = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(4),
}));

const CollaboratorList = styled(List)(({ theme }) => ({
  maxHeight: "200px",
  overflowY: "auto",
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
}));

const StatusContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(2),
  marginBottom: theme.spacing(2),
}));

export type ProjectSave = {
  name: string,
  date: Date,
}

const ProjectSettingsEditor: React.FC<EditorProps> = ({ project }) => {
  const [settings, setSettings] = useState<ProjectSettings>({ name: "", shortDesc: "", longDesc: "" });
  const [collaborators, setCollaborators] = useState<UserBasicInfoDto[]>([]);
  const [newCollaborator, setNewCollaborator] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [checkpoints, setCheckpoints] = useState<ProjectSave[]>([]);
  const [saves, setSaves] = useState<ProjectSave[]>([]);
  const [newCheckpointName, setNewCheckpointName] = useState("");

  useEffect(() => {
    const fetchProjectDetails = async (): Promise<void> => {
      try {
        const details = await ProjectsService.projectControllerFindOne(project.projectId);
        setCollaborators(details.collaborators);
        setIsPublished(details.status == ProjectWithRelationsResponseDto.status.COMPLETED || false);
      } catch (err) {
        alert("Error fetching project details: " +
          (err instanceof ApiError ? err.message : String(err)));
      }
    };

    const onSettingsChange = (newSettings: ProjectSettings) : void => {
      setSettings(newSettings);
    };

    if (project.projectSettings) {
      setSettings(project.projectSettings.getSettings());
      project.projectSettings.observe(onSettingsChange);
    }

    fetchProjectDetails();

    return () => {
      if (project.projectSettings) {
        project.projectSettings.unobserve(onSettingsChange);
      }
    };
  }, [project.projectId, project.projectSettings]);

  useEffect(() => {
    const fetchCheckpointsAndSaves = async (): Promise<void> => {
      try {
        const checkpointResponse = await ProjectsService.projectControllerGetCheckpoints(String(project.projectId));
        const versionResponse = await ProjectsService.projectControllerGetVersions(String(project.projectId));

        const fetchedCheckpoints = checkpointResponse.checkpoints.map((checkpoint: { name: string; date: string }) => ({
          name: checkpoint.name,
          date: new Date(checkpoint.date),
        }));

        const fetchedSaves = versionResponse.versions.map((version: { name: string; date: string }) => ({
          name: version.name,
          date: new Date(version.date),
        }));

        setCheckpoints(fetchedCheckpoints);
        setSaves(fetchedSaves);
      } catch (err) {
        alert("Error fetching checkpoints or saves: " +
          (err instanceof ApiError ? err.message : String(err)));
      }
    };

    fetchCheckpointsAndSaves();
  }, [project.projectId]);

  const handleAddCollaborator = async () : Promise<void> => {
    if (!newCollaborator.trim()) return;
    try {
      let details : ProjectWithRelationsResponseDto;
      if (newCollaborator.includes("@")) {
        details = await ProjectsService.projectControllerAddCollaborator(project.projectId, { email: newCollaborator });
      } else {
        details = await ProjectsService.projectControllerAddCollaborator(project.projectId, { username: newCollaborator });
      }
      setCollaborators(details.collaborators);
      setNewCollaborator("");
    } catch (err) {
      alert("Error adding collaborator. Please check the username or email. " +
        (err instanceof ApiError ? err.message : String(err)));
    }
  };

  const handleRemoveCollaborator = async (userId: number) : Promise<void> => {
    try {
      await ProjectsService.projectControllerRemoveCollaborator(project.projectId, { userId });
      setCollaborators(collaborators.filter(c => c.id !== userId));
    } catch (err) {
      alert("Error removing collaborator. Please check if you have the right to remove someone. " +
        (err instanceof ApiError ? err.message : String(err)));
    }
  };

  const handlePublishToggle = async (): Promise<void> => {
    try {
      if (!isPublished) {
        await project.saveContent();
        await ProjectsService.projectControllerPublish(project.projectId.toString());
      } else {
        await ProjectsService.projectControllerUnpublish(project.projectId.toString());
      }
      setIsPublished(!isPublished);
    } catch (err) {
      alert("Error updating publish status: " +
        (err instanceof ApiError ? err.message : String(err)));
    }
  };

  const handleCreateCheckpoint = async (): Promise<void> => {
    if (!newCheckpointName.trim()) {
      alert("Checkpoint name cannot be empty.");
      return;
    }
    try {
      await project.saveContent();
      await project.createCheckpoint(newCheckpointName);
      const checkpointResponse = await ProjectsService.projectControllerGetCheckpoints(String(project.projectId));
      const updatedCheckpoints = checkpointResponse.checkpoints.map((checkpoint: { name: string; date: string }) => ({
        name: checkpoint.name,
        date: new Date(checkpoint.date),
      }));
      setCheckpoints(updatedCheckpoints);
      setNewCheckpointName("");
    } catch (err) {
      alert("Error creating checkpoint: " +
        (err instanceof ApiError ? err.message : String(err)));
    }
  };

  const handleLoadCheckpoint = async (checkpointName: string): Promise<void> => {
    try {
      const file = await ProjectsService.projectControllerGetCheckpoint(String(project.projectId), checkpointName);
      await project.loadFromFile(file);
    } catch (err) {
      alert("Error loading checkpoint: " +
        (err instanceof ApiError ? err.message : String(err)));
    }
  };

  const handleLoadSave = async (saveName: string): Promise<void> => {
    try {
      const file = await ProjectsService.projectControllerGetVersion(String(project.projectId), saveName);
      await project.loadFromFile(file);
    } catch (err) {
      alert("Error loading save: " +
        (err instanceof ApiError ? err.message : String(err)));
    }
  };

  return (
    <EditorContainer>
      <Section>
        <Typography variant="h5" gutterBottom>Project Settings</Typography>
        <StatusContainer>
          <Typography variant="body1">Status:</Typography>
          <Chip
            label={isPublished ? "Published" : "Draft"}
            color={isPublished ? "success" : "default"}
          />
          <Button
            variant="contained"
            onClick={handlePublishToggle}
            sx={{
              backgroundColor: isPublished ? "gray.500" : "green.500",
              color: "white",
              "&:hover": {
                backgroundColor: isPublished ? "gray.600" : "green.600"
              }
            }}
          >
            {isPublished ? "Unpublish" : "Publish"}
          </Button>
        </StatusContainer>
        <FullWidthTextField
          label="Project Title"
          value={settings.name}
          onChange={(e) => project.projectSettings.updateName(e.target.value)}
        />
        <FullWidthTextField
          label="Project Short Description"
          value={settings.shortDesc}
          onChange={(e) => project.projectSettings.updateShortDesc(e.target.value)}
          multiline
          rows={2}
        />
        <FullWidthTextField
          label="Project Long Description"
          value={settings.longDesc}
          onChange={(e) => project.projectSettings.updateLongDesc(e.target.value)}
          multiline
          rows={5}
        />
      </Section>
      <Divider />
      <Section>
        <Typography variant="h6" gutterBottom>Collaborators</Typography>
        <CollaboratorList>
          {collaborators.map((user) => (
            <ListItem key={user.id} secondaryAction={
              <ActionButton
                edge="end"
                aria-label="delete"
                size="small"
                onClick={() => handleRemoveCollaborator(user.id)}
              >
                ×
              </ActionButton>
            }>
              <ListItemText primary={user.username} secondary={user.email} />
            </ListItem>
          ))}
        </CollaboratorList>
        <Box sx={{ display: "flex", alignItems: "center", mt: 2 }}>
          <FullWidthTextField
            label="Add collaborator by email or username"
            value={newCollaborator}
            onChange={(e) => setNewCollaborator(e.target.value)}
            size="small"
          />
          <Button variant="contained" onClick={handleAddCollaborator} sx={{ ml: 2, backgroundColor: "red.500", color: "white" }}>
            Add
          </Button>
        </Box>
      </Section>
      <Divider />
      <Section>
        <Typography variant="h6" gutterBottom>Checkpoints</Typography>
        <CollaboratorList>
          {checkpoints.map((checkpoint) => (
            <ListItem key={checkpoint.name} secondaryAction={
              <ActionButton
                edge="end"
                aria-label="load"
                size="small"
                sx={{
                  fontFamily: "inherit",
                  fontSize: "0.875rem",
                }}
                onClick={() => handleLoadCheckpoint(checkpoint.name)}
              >
                Load
              </ActionButton>
            }>
              <ListItemText primary={checkpoint.name} secondary={checkpoint.date.toLocaleString()} />
            </ListItem>
          ))}
        </CollaboratorList>
        <Box sx={{ display: "flex", alignItems: "center", mt: 2 }}>
          <FullWidthTextField
            label="Create new checkpoint"
            value={newCheckpointName}
            onChange={(e) => setNewCheckpointName(e.target.value)}
            size="small"
          />
          <Button
            variant="contained"
            onClick={handleCreateCheckpoint}
            sx={{
              ml: 2,
              backgroundColor: "red.500",
              color: "white",
              "&:hover": {
                backgroundColor: "red.600",
              },
            }}
          >
            Create
          </Button>
        </Box>
      </Section>
      <Divider />
      <Section>
        <Typography variant="h6" gutterBottom>Saves</Typography>
        <CollaboratorList>
          {saves.map((save) => (
            <ListItem key={save.name} secondaryAction={
              <ActionButton
                edge="end"
                aria-label="load"
                size="small"
                sx={{
                  fontFamily: "inherit",
                  fontSize: "0.875rem",
                }}
                onClick={() => handleLoadSave(save.name)}
              >
                Load
              </ActionButton>
            }>
              <ListItemText primary={save.name} secondary={save.date.toLocaleString()} />
            </ListItem>
          ))}
        </CollaboratorList>
      </Section>
    </EditorContainer>
  );
};

export default ProjectSettingsEditor;
