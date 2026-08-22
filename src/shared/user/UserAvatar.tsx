import { ProfilePicture } from "@shared/user/ProfilePicture";
import { usePublicUserProfile } from "@shared/user/usePublicUserProfile";

import { type JSX } from "react";

import { Box, Typography, type TypographyProps } from "@mui/material";

interface UserAvatarProps {
  username?: string | null;
  nickname?: string | null;
  fallbackLabel?: string;
  size?: number;
  showName?: boolean;
  nameVariant?: TypographyProps["variant"];
}

// Non-navigating profile picture (+ optional name) that resolves the image from
// the cached public profile. Shares ProfilePicture so the look matches the rest
// of the app; UserProfileLink is the navigating equivalent.
export const UserAvatar = ({
  username,
  nickname,
  fallbackLabel,
  size = 28,
  showName = false,
  nameVariant = "body2",
}: UserAvatarProps): JSX.Element => {
  const profile = usePublicUserProfile(username);
  const name =
    profile?.nickname || nickname || profile?.username || username || fallbackLabel || "Unknown";

  const avatar = <ProfilePicture src={profile?.profileImageUrl} size={size} />;

  if (!showName)
    return avatar;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      {avatar}
      <Typography variant={nameVariant}>{name}</Typography>
    </Box>
  );
};
