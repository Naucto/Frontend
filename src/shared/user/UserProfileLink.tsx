import * as urls from "@shared/navigation/routes";
import { usePublicUserProfile } from "@shared/user/usePublicUserProfile";

import React, { Fragment, useMemo } from "react";

import { Avatar, Tooltip, Typography, type TypographyProps } from "@mui/material";
import { alpha, styled } from "@mui/material/styles";
import { Link } from "react-router-dom";

export type ProfileLinkUser = {
  id?: number;
  username?: string | null;
  nickname?: string | null;
  profileImageUrl?: string | null;
};

type UserProfileLinkProps = {
  user?: ProfileLinkUser | null;
  showAvatar?: boolean;
  showName?: boolean;
  showTooltip?: boolean;
  avatarSize?: number;
  nameVariant?: TypographyProps["variant"];
  className?: string;
};

type UserProfileListProps = {
  users: ProfileLinkUser[];
  nameVariant?: TypographyProps["variant"];
  className?: string;
};

type UserAvatarStackProps = {
  users: ProfileLinkUser[];
  avatarSize?: number;
  maxVisible?: number;
  className?: string;
  stopPropagation?: boolean;
};

const PROFILE_TOOLTIP_Z_INDEX = 10050;
const PROFILE_TOOLTIP_FONT_FAMILY = "'Pixelify', 'Roboto', 'Helvetica', 'Arial', sans-serif";

const profileTooltipSlotProps = {
  popper: {
    sx: {
      zIndex: PROFILE_TOOLTIP_Z_INDEX,
    },
  },
  tooltip: {
    sx: {
      fontFamily: PROFILE_TOOLTIP_FONT_FAMILY,
      letterSpacing: 0,
    },
  },
};

const ProfileRoot = styled(Link)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: theme.spacing(0.75),
  minWidth: 0,
  color: "inherit",
  textDecoration: "none",
  verticalAlign: "middle",
  "&:hover .NauctoUserProfileLink-name": {
    color: theme.palette.yellow[500],
    textDecoration: "underline",
  },
}));

const ProfileAvatar = styled(Avatar, {
  shouldForwardProp: (prop) => prop !== "$size",
})<{ $size: number }>(({ theme, $size }) => ({
  width: $size,
  height: $size,
  flex: `0 0 ${$size}px`,
  fontSize: Math.max(11, Math.floor($size * 0.42)),
  color: theme.palette.common.white,
  backgroundColor: theme.palette.blue[700],
  border: `1px solid ${theme.palette.gray[500]}`,
}));

const ListRoot = styled("span")({
  display: "inline",
});

const AvatarStackRoot = styled("span", {
  shouldForwardProp: (prop) => prop !== "$avatarSize",
})<{ $avatarSize: number }>(({ theme, $avatarSize }) => ({
  display: "inline-flex",
  alignItems: "center",
  minHeight: $avatarSize + 4,
  isolation: "isolate",
  verticalAlign: "middle",
  "& .NauctoUserAvatarStack-item": {
    position: "relative",
    marginLeft: -Math.max(9, Math.floor($avatarSize * 0.52)),
    borderRadius: "50%",
    transition: "margin-left 0.18s ease, transform 0.18s ease",
  },
  "& .NauctoUserAvatarStack-item:first-child": {
    marginLeft: 0,
  },
  "& .NauctoUserAvatarStack-hiddenUser": {
    display: "none",
  },
  "&:hover .NauctoUserAvatarStack-item": {
    marginLeft: theme.spacing(0.2),
  },
  "&:hover .NauctoUserAvatarStack-item:first-child": {
    marginLeft: 0,
  },
  "&:hover .NauctoUserAvatarStack-hiddenUser": {
    display: "inline-flex",
  },
  "&:hover .NauctoUserAvatarStack-overflowCount": {
    display: "none",
  },
  "& .NauctoUserAvatarStack-item:hover": {
    zIndex: 20,
    transform: "translateY(-1px) scale(1.05)",
  },
  "& .NauctoUserAvatarStack-item:hover .NauctoUserProfileLink-avatar": {
    borderColor: theme.palette.yellow[500],
    boxShadow: `0 0 0 2px ${alpha(theme.palette.yellow[500], 0.3)}`,
  },
}));

const OverflowCountBubble = styled("span", {
  shouldForwardProp: (prop) => prop !== "$size",
})<{ $size: number }>(({ theme, $size }) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: $size,
  height: $size,
  flex: `0 0 ${$size}px`,
  color: theme.palette.common.white,
  backgroundColor: alpha(theme.palette.blue[700], 0.92),
  border: `1px solid ${theme.palette.gray[500]}`,
  borderRadius: "50%",
  boxShadow: `0 0 0 1px ${alpha(theme.palette.common.black, 0.35)}`,
  fontFamily: PROFILE_TOOLTIP_FONT_FAMILY,
  fontSize: Math.max(10, Math.floor($size * 0.36)),
  fontWeight: 700,
  lineHeight: 1,
}));

const Separator = styled("span")(({ theme }) => ({
  color: theme.palette.grey[400],
}));

function getDisplayName(user: ProfileLinkUser, profile: ProfileLinkUser | null): string {
  return profile?.nickname || user.nickname || profile?.username || user.username || "Unknown";
}

function getProfileTooltip(user: ProfileLinkUser, profile: ProfileLinkUser | null): string {
  const displayName = getDisplayName(user, profile);
  const username = profile?.username || user.username;

  return username && username !== displayName ? `${displayName} (${username})` : displayName;
}

function getFallbackInitial(label: string): string {
  return label.trim().charAt(0).toUpperCase() || "?";
}

function getSeparator(index: number, total: number): string {
  if (index === 0) return "";
  if (total === 2) return " and ";
  if (index === total - 1) return ", and ";
  return ", ";
}

function getUniqueUsers(users: ProfileLinkUser[]): ProfileLinkUser[] {
  const seen = new Set<string>();

  return users.filter((user) => {
    const identity = user.username ? user.username.toLowerCase() : String(user.id ?? "");
    if (!identity || seen.has(identity)) {
      return false;
    }
    seen.add(identity);
    return true;
  });
}

export const UserProfileLink: React.FC<UserProfileLinkProps> = ({
  user,
  showAvatar = false,
  showName = true,
  showTooltip = true,
  avatarSize = 24,
  nameVariant = "body2",
  className,
}) => {
  const profile = usePublicUserProfile(user?.username);
  const username = profile?.username || user?.username;

  if (!user || !username) {
    return (
      <Typography
        component="span"
        variant={nameVariant}
        className={className}
        sx={{ color: "grey.500", fontWeight: 600 }}
      >
        Unknown
      </Typography>
    );
  }

  const displayName = getDisplayName(user, profile);
  const avatarUrl = profile?.profileImageUrl || user.profileImageUrl || "";
  const tooltipTitle = getProfileTooltip(user, profile);

  const profileLink = (
    <ProfileRoot
      to={urls.toProfileByUsername(username)}
      className={className}
      aria-label={`Open ${displayName}'s profile`}
    >
      {showAvatar && (
        <ProfileAvatar src={avatarUrl} $size={avatarSize} className="NauctoUserProfileLink-avatar">
          {getFallbackInitial(displayName)}
        </ProfileAvatar>
      )}
      {showName && (
        <Typography
          component="span"
          variant={nameVariant}
          className="NauctoUserProfileLink-name"
          sx={{
            color: "common.white",
            fontWeight: 600,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayName}
        </Typography>
      )}
    </ProfileRoot>
  );

  if (!showTooltip) {
    return profileLink;
  }

  return (
    <Tooltip title={tooltipTitle} arrow slotProps={profileTooltipSlotProps}>
      {profileLink}
    </Tooltip>
  );
};

export const UserProfileList: React.FC<UserProfileListProps> = ({
  users,
  nameVariant = "body2",
  className,
}) => {
  const uniqueUsers = useMemo(() => getUniqueUsers(users), [users]);

  if (uniqueUsers.length === 0) {
    return (
      <Typography component="span" variant={nameVariant} sx={{ color: "grey.500", fontWeight: 600 }}>
        Unknown
      </Typography>
    );
  }

  return (
    <ListRoot className={className}>
      {uniqueUsers.map((user, index) => (
        <Fragment key={user.username ?? user.id ?? index}>
          <Separator>{getSeparator(index, uniqueUsers.length)}</Separator>
          <UserProfileLink user={user} nameVariant={nameVariant} />
        </Fragment>
      ))}
    </ListRoot>
  );
};

export const UserAvatarStack: React.FC<UserAvatarStackProps> = ({
  users,
  avatarSize = 24,
  maxVisible = 5,
  className,
  stopPropagation = false,
}) => {
  const uniqueUsers = useMemo(() => getUniqueUsers(users), [users]);
  const visibleUsers = uniqueUsers.slice(0, maxVisible);
  const hiddenUsers = uniqueUsers.slice(maxVisible);
  const overflowCount = hiddenUsers.length;

  if (uniqueUsers.length === 0) {
    return null;
  }

  return (
    <AvatarStackRoot
      $avatarSize={avatarSize}
      className={className}
      onClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
      onKeyDown={stopPropagation ? (event) => event.stopPropagation() : undefined}
    >
      {visibleUsers.map((user, index) => (
        <UserProfileLink
          key={user.username ?? user.id ?? index}
          user={user}
          showAvatar
          showName={false}
          avatarSize={avatarSize}
          className="NauctoUserAvatarStack-item"
        />
      ))}
      {overflowCount > 0 && (
        <OverflowCountBubble
          $size={avatarSize}
          className="NauctoUserAvatarStack-item NauctoUserAvatarStack-overflowCount NauctoUserProfileLink-avatar"
          aria-label={`${overflowCount} more creator${overflowCount === 1 ? "" : "s"}`}
        >
          +{overflowCount}
        </OverflowCountBubble>
      )}
      {hiddenUsers.map((user, index) => (
        <UserProfileLink
          key={user.username ?? user.id ?? `hidden-${index}`}
          user={user}
          showAvatar
          showName={false}
          avatarSize={avatarSize}
          className="NauctoUserAvatarStack-item NauctoUserAvatarStack-hiddenUser"
        />
      ))}
    </AvatarStackRoot>
  );
};
