import { type JSX } from "react";

import { styled } from "@mui/material/styles";

import UserIcon from "@assets/user.svg?react";

const Root = styled("div", {
  shouldForwardProp: (prop) => prop !== "size",
})<{ size: number }>(({ theme, size }) => ({
  width: size,
  height: size,
  flex: `0 0 ${size}px`,
  borderRadius: "50%",
  backgroundColor: theme.palette.gray[700],
  border: `${Math.max(1, Math.round(size / 40))}px solid ${theme.palette.gray[400]}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
}));

const Image = styled("img")({
  width: "100%",
  height: "100%",
  objectFit: "cover",
});

interface ProfilePictureProps {
  src?: string | null;
  size?: number;
  className?: string;
}

// Standard circular profile picture with the shared UserIcon fallback. Use this
// everywhere a user's avatar is shown so the look (and the missing-picture
// fallback) stays consistent across the app.
export const ProfilePicture = ({ src, size = 80, className }: ProfilePictureProps): JSX.Element => (
  <Root size={size} className={className}>
    {src
      ? <Image src={src} alt="" />
      : <UserIcon width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} />}
  </Root>
);
