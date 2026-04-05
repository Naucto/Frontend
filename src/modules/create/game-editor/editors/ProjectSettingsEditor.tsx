import React, { useState, useEffect, useRef } from "react";
import { EditorProps } from "./EditorType";
import { Box, Button, Typography, List, ListItem, ListItemText, Divider, Chip, CircularProgress, Autocomplete, TextField } from "@mui/material";
import { styled } from "@mui/material/styles";
import {
  projectControllerFindOne,
  projectControllerAddCollaborator,
  projectControllerRemoveCollaborator,
  projectControllerPublish,
  projectControllerUnpublish,
  projectControllerUpdateRelease,
  projectControllerUploadProjectImage,
  projectControllerGetProjectImage,
  ProjectExResponseDto,
  UserBasicInfoDto
} from "@api";
import { ProjectSettings } from "@providers/editors/ProjectSettingsProvider";
import { ActionButton } from "@components/ui/ActionButton";
import { FullWidthTextField } from "@components/ui/FullWidthTextField";
import { PREDEFINED_PROJECT_TAGS } from "@modules/projects/projectTags";
import {
  getCachedProjectImageUrl,
  invalidateCachedProjectImageUrl,
  setCachedProjectImageUrl,
} from "@utils/projectImageCache";

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

const BannerPreview = styled("img")({
  maxHeight: "200px",
  maxWidth: "100%",
  borderRadius: "4px",
  objectFit: "cover",
});

const TagPickerContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1.25),
  borderRadius: theme.custom.rounded.md,
  backgroundColor: theme.palette.blue[500],
  border: `1px solid ${theme.palette.blue[300]}`,
  boxShadow: `inset 0 0 0 1px ${theme.palette.blue[400]}`,
}));

const ProjectSettingsEditor: React.FC<EditorProps> = ({ project }) => {
  const [settings, setSettings] = useState<ProjectSettings>({ name: "", shortDesc: "", longDesc: "", iconUrl: "", tags: [] });
  const [collaborators, setCollaborators] = useState<UserBasicInfoDto[]>([]);
  const [newCollaborator, setNewCollaborator] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [isUpdatingRelease, setIsUpdatingRelease] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProjectDetails = async (): Promise<void> => {
      try {
        const details = (await projectControllerFindOne({ path: { id: project.projectId } })).data as ProjectExResponseDto;
        setCollaborators(details.collaborators);
        setIsPublished(details.status === ("COMPLETED" satisfies ProjectExResponseDto["status"]) || false);
        setPublishedAt((details as Record<string, unknown>).publishedAt as string | null ?? null);
        if (project.projectSettings && details.tags) {
          project.projectSettings.updateTags(details.tags);
        }
      } catch (err) {
        alert("Error fetching project details: " +
          (err instanceof Error ? err.message : String(err)));
      }
    };

    const fetchBannerImage = async (): Promise<void> => {
      try {
        const imageUrl = await getCachedProjectImageUrl(
          "draft",
          project.projectId,
          async () => {
            const res = await projectControllerGetProjectImage({ path: { id: project.projectId } });
            return res.data?.url ?? null;
          },
          project.projectSettings?.getSettings().iconUrl,
        );
        if (imageUrl) {
          setBannerUrl(imageUrl);
        }
      } catch {
        // No banner image yet
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
    fetchBannerImage();

    return () => {
      if (project.projectSettings) {
        project.projectSettings.unobserve(onSettingsChange);
      }
    };
  }, [project.projectId, project.projectSettings]);

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      invalidateCachedProjectImageUrl("draft", project.projectId);
      await projectControllerUploadProjectImage({
        path: { id: project.projectId },
        body: { file }
      });

      const imageUrl = await getCachedProjectImageUrl(
        "draft",
        project.projectId,
        async () => {
          const res = await projectControllerGetProjectImage({ path: { id: project.projectId } });
          return res.data?.url ?? null;
        },
        project.projectSettings?.getSettings().iconUrl,
      );
      setCachedProjectImageUrl("draft", project.projectId, imageUrl);
      if (imageUrl) {
        setBannerUrl(imageUrl);
      }
    } catch (err) {
      alert("Error uploading banner image: " +
        (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleAddCollaborator = async () : Promise<void> => {
    if (!newCollaborator.trim()) return;
    try {
      let details : ProjectExResponseDto;
      if (newCollaborator.includes("@")) {
        details = (await projectControllerAddCollaborator({ path: { id: project.projectId }, body: { email: newCollaborator } })).data!;
      } else {
        details = (await projectControllerAddCollaborator({ path: { id: project.projectId }, body: { username: newCollaborator } })).data!;
      }
      setCollaborators(details.collaborators);
      setNewCollaborator("");
    } catch (err) {
      alert("Error adding collaborator. Please check the username or email. " +
        (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleRemoveCollaborator = async (userId: number) : Promise<void> => {
    try {
      await projectControllerRemoveCollaborator({ path: { id: project.projectId }, body: { userId } });
      setCollaborators(collaborators.filter(c => c.id !== userId));
    } catch (err) {
      alert("Error removing collaborator. Please check if you have the right to remove someone. " +
        (err instanceof Error ? err.message : String(err)));
    }
  };

  const handlePublishToggle = async (): Promise<void> => {
    // TODO: clarify publish/unpublish persistence behavior (publish currently saves before toggling, unpublish does not).
    try {
      if (!isPublished) {
        await project.saveContent();
        await projectControllerPublish({ path: { id: project.projectId.toString() } });
        invalidateCachedProjectImageUrl("published", project.projectId);
        setPublishedAt(new Date().toISOString());
      } else {
        await projectControllerUnpublish({ path: { id: project.projectId.toString() } });
        invalidateCachedProjectImageUrl("published", project.projectId);
      }
      setIsPublished(!isPublished);
    } catch (err) {
      alert("Error updating publish status: " +
        (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleUpdateRelease = async (): Promise<void> => {
    setIsUpdatingRelease(true);
    try {
      await project.saveContent();
      await projectControllerUpdateRelease({ path: { id: project.projectId.toString() } });
      invalidateCachedProjectImageUrl("published", project.projectId);
      setPublishedAt(new Date().toISOString());
    } catch (err) {
      alert("Error updating release: " +
        (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsUpdatingRelease(false);
    }
  };

  return (
    <>
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
          {isPublished && (
            <Button
              variant="contained"
              color="primary"
              onClick={handleUpdateRelease}
              disabled={isUpdatingRelease}
            >
              {isUpdatingRelease ? (
                <><CircularProgress size={16} sx={{ mr: 1 }} /> Updating...</>
              ) : (
                "Update Release"
              )}
            </Button>
          )}
        </StatusContainer>
        {isPublished && publishedAt && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Last published: {new Date(publishedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </Typography>
        )}
        <FullWidthTextField
          label="Project Title"
          value={settings.name}
          onChange={(e) => project.projectSettings.updateName(e.target.value)}
        />

        <Box sx={{ mt: 2, mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>Project Banner Image</Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
            <Button
              variant="outlined"
              component="label"
              disabled={isUploading}
            >
              {isUploading ? (
                <><CircularProgress size={16} sx={{ mr: 1 }} /> Uploading...</>
              ) : (
                "Upload Banner Image"
              )}
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleBannerUpload}
              />
            </Button>
            <Typography variant="caption" color="text.secondary">
              Max 5MB. Accepted: JPEG, PNG, GIF, WebP
            </Typography>
          </Box>
          {bannerUrl && (
            <Box sx={{ display: "flex", justifyContent: "center" }}>
              <BannerPreview src={bannerUrl} alt="Project Banner" />
            </Box>
          )}
        </Box>

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
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle1" gutterBottom>Project Tags</Typography>
          <TagPickerContainer>
            <Autocomplete
              multiple
              freeSolo
              options={[...PREDEFINED_PROJECT_TAGS]}
              value={settings.tags}
              onChange={(_, value) => project.projectSettings.updateTags(value.map((tag) => tag.trim()).filter(Boolean))}
              slotProps={{
                paper: {
                  sx: {
                    mt: 1,
                    backgroundColor: theme => theme.palette.blue[800],
                    color: "white",
                    backgroundImage: "none",
                    border: theme => `1px solid ${theme.palette.blue[400]}`,
                    ".MuiAutocomplete-listbox": {
                      padding: 0.5,
                      maxHeight: 240,
                      overflowY: "auto",
                    },
                  }
                },
                listbox: {
                  sx: {
                    maxHeight: 240,
                    overflowY: "auto",
                  }
                },
              }}
              renderOption={(props, option, { selected }) => (
                <Box
                  component="li"
                  {...props}
                  sx={{
                    color: "white",
                    backgroundColor: `${selected ? "rgba(255, 255, 255, 0.12)" : "transparent"} !important`,
                    borderRadius: 1,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 1,
                    px: 1.25,
                    py: 0.9,
                  }}
                >
                  <span>{option}</span>
                  {selected && <Chip label="Selected" size="small" sx={{ backgroundColor: "rgba(255,255,255,0.18)", color: "white" }} />}
                </Box>
              )}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    {...getTagProps({ index })}
                    key={`${option}-${index}`}
                    label={option}
                    size="small"
                    sx={{ backgroundColor: theme => theme.palette.blue[700], color: "white" }}
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Add predefined or custom tags"
                  placeholder="Roguelike, Shooter, custom tag..."
                  sx={{
                    ".MuiOutlinedInput-root": {
                      color: "white",
                      backgroundColor: "transparent",
                    },
                    ".MuiOutlinedInput-notchedOutline": {
                      borderColor: "rgba(255,255,255,0.28)",
                    },
                    ".MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
                      borderColor: "rgba(255,255,255,0.42)",
                    },
                    ".MuiInputLabel-root": {
                      color: "rgba(255,255,255,0.82)",
                    },
                    ".MuiInputLabel-root.Mui-focused": {
                      color: "white",
                    },
                  }}
                />
              )}
            />
          </TagPickerContainer>
        </Box>
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
    </>
  );
};

export default ProjectSettingsEditor;
