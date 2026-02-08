import { JSX, useEffect, useMemo, useState } from "react";
import { styled } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import { UsersService } from "@api/services/UsersService";
import { useAsync } from "src/hooks/useAsync";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import ImportantButton from "@shared/buttons/ImportantButton";
import { Editable } from "@shared/forms/Editable";
import { useForm } from "react-hook-form";
import { UpdateUserProfileDto } from "@api/models/UpdateUserProfileDto";
import UserIcon from "@assets/user.svg?react";
import { useSnackbar } from "notistack";

const ProfileBackground = styled("div")<{ src: string }>(({ src, theme }) => ({
  position: "absolute",
  width: "100%",
  height: theme.spacing(54),
  backgroundImage: `url(${src})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  zIndex: 0,
}));

const ProfileInfo = styled(Box)(({ theme }) => ({
  // make box absolute positioned at the top of the page
  width: "100%",
  position: "relative",
  flex: 1,
  display: "flex",
  flexDirection: "row",
  backgroundPosition: "center",
  maxHeight: theme.spacing(56),
  paddingTop: theme.spacing(5),
  paddingLeft: theme.spacing(14),
  gap: theme.spacing(2),
}));

const ProfilePicture = styled("div")(({ theme }) => ({
  width: theme.spacing(10),
  height: theme.spacing(10),
  borderRadius: "50%",
  backgroundColor: theme.palette.gray[700],
  border: `2px solid ${theme.palette.gray[400]}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  marginBottom: theme.spacing(2),
}));

const ProfileImage = styled("img")({
  width: "100%",
  height: "100%",
  objectFit: "cover",
});

const ChangePhotoButton = styled(ImportantButton)(({ theme }) => ({
  marginTop: theme.spacing(1),
  width: theme.spacing(18),
  fontSize: "14px",
}));

const TextInfo = styled("div")(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  color: theme.palette.common.white,
  textShadow: `2px 2px 4px ${theme.palette.gray[900]}`,
}));

const EditProfileButton = styled(ImportantButton)(({ theme }) => ({
  marginTop: theme.spacing(1),
  width: theme.spacing(15),
  fontSize: "16px"
}));

export const Profile = (): JSX.Element => {
  const { profileId } = useParams<{ profileId: string }>();
  const userId = Number(LocalStorageManager.getUserId());
  const isEditable = profileId ? Number(profileId) === userId : false;
  const [isEditing, setIsEditing] = useState(false);
  const [refresh, setRefresh] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { enqueueSnackbar } = useSnackbar();

  const { value: profile } = useAsync(
    () => {
      if (!profileId) return Promise.reject();
      return UsersService.userControllerFindOne(Number(profileId));
    },
    [profileId, refresh]
  );
  const { register, handleSubmit, reset } = useForm<UpdateUserProfileDto>();

  useEffect(() => {
    if (profile?.data) {
      reset({
        description: profile.data.description ?? "",
      });
      setSelectedFile(null);
    }
  }, [profile, reset]);

  const previewUrl = useMemo(() => {
    if (!selectedFile) return null;
    return URL.createObjectURL(selectedFile);
  }, [selectedFile]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  const handleProfileUpdate = async (data: UpdateUserProfileDto): Promise<void> => {
    try {
      if (selectedFile) {
        await UsersService.userControllerUpdateProfilePhoto({ file: selectedFile });
      }
      const currentDescription = profile?.data.description ?? "";
      const nextDescription = data.description ?? "";
      if (nextDescription !== currentDescription) {
        await UsersService.userControllerUpdateProfile({ description: nextDescription });
      }
      setIsEditing(false);
      setRefresh((prev) => prev * -1);
      setSelectedFile(null);
      enqueueSnackbar("Profile updated successfully", { variant: "success" });
    } catch (error) {
      console.error("Error updating profile:", error);
      enqueueSnackbar("Error updating profile", { variant: "error" });
    }
  };

  const handleEditButtonClick = (): void => {
    setIsEditing(!isEditing);
    if (isEditing) {
      setSelectedFile(null);
    }
  };

  const profileImageUrl = previewUrl ?? profile?.data.profileImageUrl ?? "";

  return (
    <>
      <form onSubmit={handleSubmit(handleProfileUpdate)}>
        <ProfileBackground src="https://png.pngtree.com/thumb_back/fh260/background/20250512/pngtree-blue-gradient-soft-background-vector-image_17280771.jpg" />
        <ProfileInfo>
          <ProfilePicture>
            {profileImageUrl ? (
              <ProfileImage src={profileImageUrl} alt="Profile" />
            ) : (
              <UserIcon width={32} height={32} />
            )}
          </ProfilePicture>
          <TextInfo>
            <Typography variant="h5">{profile?.data.username}</Typography>
            <Editable editing={isEditing} value={profile?.data.description ?? ""} register={register("description")}>
              <Typography>{profile?.data.description}</Typography>
            </Editable>
            {isEditable && isEditing && (
              <ChangePhotoButton component="label">
                Change photo
                <input
                  hidden
                  accept="image/png,image/jpeg,image/webp"
                  type="file"
                  onChange={handleFileChange}
                />
              </ChangePhotoButton>
            )}
            {isEditable && <EditProfileButton onClick={handleEditButtonClick}>{isEditing ? "Cancel" : "Edit Profile"}</EditProfileButton>}
            {isEditing && <EditProfileButton type="submit">Submit</EditProfileButton>}
          </TextInfo>
        </ProfileInfo>
      </form>
    </>
  );
};

export default Profile;
