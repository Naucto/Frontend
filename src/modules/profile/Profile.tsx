import { JSX, useEffect, useState } from "react";
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

const ProfilePicture = styled("div")<{ src: string}>(({ src, theme }) => ({
  width: theme.spacing(10),
  height: theme.spacing(10),
  borderRadius: "50%",
  backgroundImage: `url(${src})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  marginBottom: theme.spacing(2),
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
    }
  }, [profile, reset]);
  const handleProfileUpdate = async (data: UpdateUserProfileDto): Promise<void> => {
    try {
      await UsersService.userControllerUpdateProfile(data);
      setIsEditing(false);
      setRefresh((prev) => prev * -1);
    } catch (error) {
      console.error("Error updating profile:", error);
    }
  };

  const handleEditButtonClick = (): void => {
    setIsEditing(!isEditing);
  };

  return (
    <>
      <form onSubmit={handleSubmit(handleProfileUpdate)}>
        <ProfileBackground src="https://png.pngtree.com/thumb_back/fh260/background/20250512/pngtree-blue-gradient-soft-background-vector-image_17280771.jpg" />
        <ProfileInfo>
          <ProfilePicture  src="https://png.pngtree.com/thumb_back/fh260/background/20250512/pngtree-blue-gradient-soft-background-vector-image_17280771.jpg" />
          <TextInfo>
            <Typography variant="h5">{profile?.data.username}</Typography>
            <Editable editing={isEditing} value={profile?.data.description ?? ""} register={register("description")}>
              <Typography>{profile?.data.description}</Typography>
            </Editable>
            {isEditable && <EditProfileButton onClick={handleEditButtonClick}>{isEditing ? "Cancel" : "Edit Profile"}</EditProfileButton>}
            {isEditing && <EditProfileButton type="submit">Submit</EditProfileButton>}
          </TextInfo>
        </ProfileInfo>
      </form>
    </>
  );
};

export default Profile;
