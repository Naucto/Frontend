import React, { useState, useEffect } from "react";
import { EditorProps } from "./EditorType";
import { Box, TextField, Button, Typography, List, ListItem, ListItemText, IconButton, Paper, Divider } from "@mui/material";
import { styled } from "@mui/material/styles";
import { ProjectsService, ProjectWithRelationsResponseDto, UserBasicInfoDto } from "@api";

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

const ProjectSettingsEditor: React.FC<EditorProps> = ({ project }) => {
  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [collaborators, setCollaborators] = useState<UserBasicInfoDto[]>([]);
  const [newCollaborator, setNewCollaborator] = useState("");

  useEffect(() => {
    const fetchProjectDetails = async (): Promise<void> => {
      try {
        const details = await ProjectsService.projectControllerFindOne(project.projectId);
        setTitle(details.name);
        setShortDescription(details.shortDesc);
        setLongDescription(typeof details.longDesc === "string" ? details.longDesc : "");
        setCollaborators(details.collaborators);
      } catch (error) {
        console.error("Failed to fetch project details:", error);
      }
    };

    fetchProjectDetails();
  }, [project.projectId]);

  const handleSaveChanges = async () : Promise<void> => {
    try {
      await ProjectsService.projectControllerUpdate(project.projectId, {
        name: title,
        shortDesc: shortDescription,
        longDesc: longDescription,
      });
      alert("Project details saved!");
    } catch (error) {
      console.error("Failed to save project details:", error);
      alert("Error saving project details.");
    }
  };

  const handleAddCollaborator = async () : Promise<void>=> {
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
    } catch (error) {
      console.error("Failed to add collaborator:", error);
      alert("Error adding collaborator. Please check the username or email.");
    }
  };

  const handleRemoveCollaborator = async (userId: number) : Promise<void>=> {
    try {
      await ProjectsService.projectControllerRemoveCollaborator(project.projectId, { userId });
      setCollaborators(collaborators.filter(c => c.id !== userId));
    } catch (error) {
      console.error("Failed to remove collaborator:", error);
      alert("Error removing collaborator.");
    }
  };

  return (
    <EditorContainer>
      <Section>
        <Typography variant="h5" gutterBottom>Project Settings</Typography>
        <TextField
          fullWidth
          label="Project Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          variant="outlined"
          margin="normal"
        />
        <TextField
          fullWidth
          label="Project Short Description"
          value={shortDescription}
          onChange={(e) => setShortDescription(e.target.value)}
          variant="outlined"
          margin="normal"
          multiline
          rows={2}
        />
        <TextField
          fullWidth
          label="Prjoect Long Description"
          value={longDescription}
          onChange={(e) => setLongDescription(e.target.value)}
          variant="outlined"
          margin="normal"
          multiline
          rows={5}
        />
        <Button variant="contained" sx={{ backgroundColor: "red.500", color: "white" }} onClick={handleSaveChanges}>
          Save Changes
        </Button>
      </Section>

      <Divider />

      <Section>
        <Typography variant="h6" gutterBottom>Collaborators</Typography>
        <CollaboratorList>
          {collaborators.map((user) => (
            <ListItem key={user.id} secondaryAction={
              <IconButton
                edge="end"
                aria-label="delete"
                size="small"
                sx={{ backgroundColor: "red.500", color: "white", borderRadius: "50%" }}
                onClick={() => handleRemoveCollaborator(user.id)}
              >
                ×
              </IconButton>
            }>
              <ListItemText primary={user.username} secondary={user.email} />
            </ListItem>
          ))}
        </CollaboratorList>
        <Box sx={{ display: "flex", alignItems: "center", mt: 2 }}>
          <TextField
            fullWidth
            label="Add collaborator by email or username"
            value={newCollaborator}
            onChange={(e) => setNewCollaborator(e.target.value)}
            variant="outlined"
            size="small"
          />
          <Button variant="contained" onClick={handleAddCollaborator} sx={{ ml: 2, backgroundColor: "red.500", color: "white" }}>
            Add
          </Button>
        </Box>
      </Section>
    </EditorContainer>
  );
};

export default ProjectSettingsEditor;
