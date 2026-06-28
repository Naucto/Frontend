import { usePublicUserProfile } from "@shared/user/usePublicUserProfile";

import { type JSX } from "react";

import { Avatar, Box, Typography, type TypographyProps } from "@mui/material";

interface UserAvatarProps {
  username?: string | null;
  nickname?: string | null;
  fallbackLabel?: string;
  size?: number;
  showName?: boolean;
  nameVariant?: TypographyProps["variant"];
}

// Non-navigating avatar (+ optional name) that resolves the picture from the
// cached public profile. Shared by the navbar and session listings so the
// "who is this" preview looks the same everywhere.
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

  const avatar = (
    <Avatar src={profile?.profileImageUrl ?? ""} sx={{ width: size, height: size }}>
      {name.charAt(0).toUpperCase()}
    </Avatar>
  );

  if (!showName)
    return avatar;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      {avatar}
      <Typography variant={nameVariant}>{name}</Typography>
    </Box>
  );
};
