import { JSX, useEffect, useMemo, useRef, useState } from "react";
import { styled } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "src/hooks/useAsync";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import ImportantButton from "@shared/buttons/ImportantButton";
import { Editable } from "@shared/forms/Editable";
import { useForm } from "react-hook-form";
import UserIcon from "@assets/user.svg?react";
import { useSnackbar } from "notistack";
import * as urls from "@shared/route";
import {
  ProjectExResponseDto,
  userPublicControllerGetPublicProfileByUsername,
  userPublicControllerGetLikedGames,
  userPublicControllerGetPublishedGames,
  userControllerUpdateMyProfile,
  userControllerUploadProfilePicture,
  PublicUserProfileDto,
  userControllerUploadProfileBackground,
} from "@api";
import { isAxiosError } from "axios";
import ProjectCard from "@modules/projects/components/ProjectCard";

const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/webp";

const DEFAULT_PROFILE_BACKGROUND =
  "https://png.pngtree.com/thumb_back/fh260/background/20250512/pngtree-blue-gradient-soft-background-vector-image_17280771.jpg";

const ProfileBackground = styled("div")<{ src: string }>(({ src }) => ({
  position: "absolute",
  width: "100%",
  height: "100%",
  backgroundImage: `url(${src})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  zIndex: 0,
}));

const ProfileHeader = styled("div")(({ theme }) => ({
  position: "relative",
  width: "100%",
  height: theme.spacing(56),
  overflow: "hidden",
}));

const ProfileInfo = styled(Box)(({ theme }) => ({
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

const Description = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[200],
}));

const ChangePhotoButton = styled(ImportantButton)(({ theme }) => ({
  marginTop: theme.spacing(1),
  width: "fit-content",
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
  width: "fit-content",
  fontSize: "16px"
}));

const HorizontalBox = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "row",
  gap: theme.spacing(1),
}));

const Section = styled(Box)(({ theme }) => ({
  position: "relative",
  zIndex: 1,
  paddingLeft: theme.spacing(14),
  paddingRight: theme.spacing(14),
  paddingTop: theme.spacing(2),
}));

const HorizontalScroller = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "row",
  gap: theme.spacing(2),
  overflowX: "auto",
  paddingBottom: theme.spacing(1),
}));

const ProjectCardWrapper = styled(Box)(() => ({
  flex: "0 0 auto",
  width: 360,
}));

const SectionHeader = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: theme.spacing(2),
}));

const SeeAllLink = styled(Link)(({ theme }) => ({
  color: theme.palette.grey[200],
  textDecoration: "none",
  fontSize: "22px",
  "&:hover": {
    textDecoration: "underline",
  },
}));

const PROFILE_GAMES_PREVIEW_LIMIT = 5;

export const Profile = (): JSX.Element => {
  const { username } = useParams<{ username?: string }>();
  const userId = Number(LocalStorageManager.getUserId());
  const [isEditing, setIsEditing] = useState(false);
  const [refresh, setRefresh] = useState(1);
  const [selectedProfileFile, setSelectedProfileFile] = useState<File | null>(null);
  const [selectedBackgroundFile, setSelectedBackgroundFile] = useState<File | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const profileFileInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundFileInputRef = useRef<HTMLInputElement | null>(null);

  const { value: profile } = useAsync(
    () => {
      if (username) {
        return userPublicControllerGetPublicProfileByUsername<true>({
          throwOnError: true,
          path: { username },
        });
      }
      return Promise.reject(new Error("Missing profile identifier"));
    },
    [username, refresh]
  );
  const { register, handleSubmit, reset } = useForm<{ description?: string }>();

  const profileData = profile?.data?.data as PublicUserProfileDto | undefined;
  const resolvedProfileId = useMemo(
    () => profileData?.id ?? Number.NaN,
    [profileData?.id]
  );

  const isEditable = Number.isFinite(resolvedProfileId) && resolvedProfileId === userId;

  useEffect(() => {
    if (profileData) {
      reset({
        description: profileData.description ?? "",
      });
      setSelectedProfileFile(null);
      setSelectedBackgroundFile(null);
    }
  }, [profileData, reset]);

  const { value: likedGames } = useAsync(
    async () => {
      if (!Number.isFinite(resolvedProfileId)) return [];
      const { data } = await userPublicControllerGetLikedGames({
        path: { id: resolvedProfileId },
        query: { page: 1, limit: PROFILE_GAMES_PREVIEW_LIMIT },
        throwOnError: true,
      });
      return (data ?? []) as ProjectExResponseDto[];
    },
    [resolvedProfileId, refresh]
  );

  const { value: publishedGames } = useAsync(
    async () => {
      if (!Number.isFinite(resolvedProfileId)) return [];
      const { data } = await userPublicControllerGetPublishedGames({
        path: { id: resolvedProfileId },
        query: { page: 1, limit: PROFILE_GAMES_PREVIEW_LIMIT },
        throwOnError: true,
      });
      return (data ?? []) as ProjectExResponseDto[];
    },
    [resolvedProfileId, refresh]
  );

  const profilePreviewUrl = useMemo(() => {
    if (!selectedProfileFile) return null;
    return URL.createObjectURL(selectedProfileFile);
  }, [selectedProfileFile]);

  const backgroundPreviewUrl = useMemo(() => {
    if (!selectedBackgroundFile) return null;
    return URL.createObjectURL(selectedBackgroundFile);
  }, [selectedBackgroundFile]);

  useEffect(() => {
    if (!profilePreviewUrl) return;
    return () => URL.revokeObjectURL(profilePreviewUrl);
  }, [profilePreviewUrl]);

  useEffect(() => {
    if (!backgroundPreviewUrl) return;
    return () => URL.revokeObjectURL(backgroundPreviewUrl);
  }, [backgroundPreviewUrl]);

  const handleProfileFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] ?? null;
    setSelectedProfileFile(file);
  };

  const handleBackgroundFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] ?? null;
    setSelectedBackgroundFile(file);
  };

  const handleProfileUpdate = async (data: { description?: string }): Promise<void> => {
    try {
      if (!isEditable) return;

      if (selectedProfileFile) {
        await userControllerUploadProfilePicture<true>({
          throwOnError: true,
          path: { id: userId },
          body: { file: selectedProfileFile },
        });
      }

      if (selectedBackgroundFile) {
        await userControllerUploadProfileBackground<true>({
          throwOnError: true,
          path: { id: userId },
          body: { file: selectedBackgroundFile },
        });
      }

      const currentDescription = profileData?.description ?? "";
      const nextDescription = data.description ?? "";
      if (nextDescription !== currentDescription) {
        await userControllerUpdateMyProfile<true>({
          throwOnError: true,
          body: { description: nextDescription },
        });
      }

      setIsEditing(false);
      setRefresh((prev) => prev * -1);
      setSelectedProfileFile(null);
      setSelectedBackgroundFile(null);
      enqueueSnackbar("Profile updated successfully", { variant: "success" });
    } catch (error) {
      if (isAxiosError(error)) {
        const errorMessage = error.response?.data?.message ?? "An error occurred while updating the profile";
        enqueueSnackbar(errorMessage, { variant: "error" });
      }
      else {
        enqueueSnackbar("An unexpected error occurred while updating the profile", { variant: "error" });
      }
    }
  };

  const handleEditButtonClick = (): void => {
    setIsEditing(!isEditing);
    if (isEditing) {
      setSelectedProfileFile(null);
      setSelectedBackgroundFile(null);
    }
  };

  const profileImageUrl =
    profilePreviewUrl ?? profileData?.profileImageUrl ?? "";
  const backgroundImageUrl =
    backgroundPreviewUrl ?? profileData?.backgroundImageUrl ?? DEFAULT_PROFILE_BACKGROUND;

  return (
    <>
      <form onSubmit={handleSubmit(handleProfileUpdate)}>
        <ProfileHeader>
          <ProfileBackground src={backgroundImageUrl} />
          <ProfileInfo>
            <ProfilePicture>
              {profileImageUrl ? (
                <ProfileImage src={profileImageUrl} alt="Profile" />
              ) : (
                <UserIcon width={32} height={32} />
              )}
            </ProfilePicture>
            <TextInfo>
              <Typography variant="h4">
                {profileData?.username ?? ""}
              </Typography>
              <Editable
                editing={isEditing}
                value={profileData?.description ?? ""}
                register={register("description")}
              >
                <Description variant="body1"
                >{profileData?.description ?? ""}</Description>
              </Editable>

              {isEditable && isEditing && (
                <HorizontalBox>
                  <ChangePhotoButton
                    type="button"
                    onClick={() => profileFileInputRef.current?.click()}
                  >
                    Change photo
                  </ChangePhotoButton>

                  <input
                    ref={profileFileInputRef}
                    hidden
                    accept={ACCEPTED_IMAGE_TYPES}
                    type="file"
                    onChange={handleProfileFileChange}
                  />

                  <ChangePhotoButton
                    type="button"
                    onClick={() => backgroundFileInputRef.current?.click()}
                  >
                    Change background
                  </ChangePhotoButton>
                  <input
                    ref={backgroundFileInputRef}
                    hidden
                    accept={ACCEPTED_IMAGE_TYPES}
                    type="file"
                    onChange={handleBackgroundFileChange}
                  />
                </HorizontalBox>
              )}
              <HorizontalBox>
                {isEditable && (
                  <EditProfileButton type="button" onClick={handleEditButtonClick}>
                    {isEditing ? "Cancel" : "Edit Profile"}
                  </EditProfileButton>
                )}
                {isEditable && isEditing && <EditProfileButton type="submit">Submit</EditProfileButton>}
              </HorizontalBox>
            </TextInfo>
          </ProfileInfo>
        </ProfileHeader>

        <Section>
          <SectionHeader>
            <Typography variant="h6" color="white">Published games</Typography>
            {username && (
              <SeeAllLink to={urls.toProfilePublishedGamesByUsername(username)}>See all</SeeAllLink>
            )}
          </SectionHeader>
          <HorizontalScroller>
            {(publishedGames ?? []).slice(0, PROFILE_GAMES_PREVIEW_LIMIT).map((game) => (
              <ProjectCardWrapper key={game.id}>
                <ProjectCard project={game} isPlayable />
              </ProjectCardWrapper>
            ))}
          </HorizontalScroller>
        </Section>

        <Section>
          <SectionHeader>
            <Typography variant="h6" color="white">Liked games</Typography>
            {username && (
              <SeeAllLink to={urls.toProfileLikedGamesByUsername(username)}>See all</SeeAllLink>
            )}
          </SectionHeader>
          <HorizontalScroller>
            {(likedGames ?? []).slice(0, PROFILE_GAMES_PREVIEW_LIMIT).map((game) => (
              <ProjectCardWrapper key={game.id}>
                <ProjectCard project={game} isPlayable />
              </ProjectCardWrapper>
            ))}
          </HorizontalScroller>
        </Section>
      </form>
    </>
  );
};

export default Profile;
