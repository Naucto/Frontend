import { JSX } from "react";
import { styled } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";
import { useParams } from "react-router-dom";
import { UsersService } from "@api/services/UsersService";
import { useAsync } from "src/hooks/useAsync";

const ProfileInfo = styled(Box)<{ src: string}>(({ src, theme }) => ({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  backgroundImage: `url(${src})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  maxHeight: theme.spacing(56),
  padding: theme.spacing(8),
}));

export const Profile = (): JSX.Element => {
  const { profileId } = useParams<{ profileId: string }>();
  const { value: profile } = useAsync(
    () => {
      if (!profileId) return Promise.reject();
      return UsersService.userControllerFindOne(Number(profileId));
    },
    [profileId]
  );

  return (
    <>
      <ProfileInfo src="https://png.pngtree.com/thumb_back/fh260/background/20250512/pngtree-blue-gradient-soft-background-vector-image_17280771.jpg">
        <Typography variant="h6">{profile?.data.username}</Typography>
        <Typography variant="body2" color="text.secondary">
          {profile?.data.email}
        </Typography>
      </ProfileInfo>
    </>
  );
};

export default Profile;
