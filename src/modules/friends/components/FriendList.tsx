import {
  friendControllerGetMyFriends,
  friendControllerRemoveFriend,
  type FriendResponseDto,
} from "@api";
import { useAsync } from "@hooks/useAsync";
import * as urls from "@shared/navigation/routes";
import { UserProfileLink } from "@shared/user/UserProfileLink";

import { JSX, useCallback, useState } from "react";

import { Avatar, Box, Button, CircularProgress, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useSnackbar } from "notistack";
import { Link } from "react-router-dom";

const EmptyState = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: theme.spacing(2),
  padding: theme.spacing(8, 2),
  color: theme.palette.grey[400],
}));

const FriendCard = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(2),
  padding: theme.spacing(2),
  borderRadius: theme.spacing(1),
  backgroundColor: theme.palette.gray[700],
  border: `1px solid ${theme.palette.gray[500]}`,
}));

const FriendAvatar = styled(Avatar)(({ theme }) => ({
  width: theme.spacing(6),
  height: theme.spacing(6),
  backgroundColor: theme.palette.blue[700],
  border: `2px solid ${theme.palette.gray[400]}`,
  flexShrink: 0,
}));

const FriendInfo = styled(Box)({
  flex: 1,
  minWidth: 0,
});

const FriendGrid = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: theme.spacing(2),
}));

const RemoveButton = styled(Button)(({ theme }) => ({
  color: theme.palette.error.light,
  borderColor: theme.palette.error.light,
  fontSize: "12px",
  minWidth: "auto",
  padding: theme.spacing(0.5, 1.5),
  "&:hover": {
    borderColor: theme.palette.error.main,
    backgroundColor: `${theme.palette.error.main}22`,
  },
}));

type FriendListProps = {
  onCountChange?: () => void;
};

export const FriendList = ({ onCountChange }: FriendListProps): JSX.Element => {
  const { enqueueSnackbar } = useSnackbar();
  const [refresh, setRefresh] = useState(0);

  const { value: response, loading } = useAsync(
    () => friendControllerGetMyFriends<true>({ throwOnError: true }),
    [refresh]
  );

  const friends: FriendResponseDto[] = (response?.data as { data?: FriendResponseDto[] } | undefined)?.data ?? [];

  const handleRemove = useCallback(async (friendUserId: number, username: string): Promise<void> => {
    try {
      await friendControllerRemoveFriend<true>({
        throwOnError: true,
        path: { userId: friendUserId },
      });
      enqueueSnackbar(`Removed ${username} from friends`, { variant: "success" });
      setRefresh((prev) => prev + 1);
      onCountChange?.();
    } catch {
      enqueueSnackbar("Failed to remove friend", { variant: "error" });
    }
  }, [enqueueSnackbar, onCountChange]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }

  if (friends.length === 0) {
    return (
      <EmptyState>
        <Typography variant="h6">No friends yet</Typography>
        <Typography variant="body2">
          Search for players on their profiles and send them a friend request!
        </Typography>
      </EmptyState>
    );
  }

  return (
    <FriendGrid>
      {friends.map((friendship) => (
        <FriendCard key={friendship.friendshipId}>
          <Link to={urls.toProfileByUsername(friendship.user.username)} style={{ textDecoration: "none" }}>
            <FriendAvatar src={friendship.user.profileImageUrl ?? undefined}>
              {friendship.user.username.charAt(0).toUpperCase()}
            </FriendAvatar>
          </Link>
          <FriendInfo>
            <UserProfileLink
              user={{
                id: friendship.user.id,
                username: friendship.user.username,
                nickname: friendship.user.nickname,
                profileImageUrl: friendship.user.profileImageUrl,
              }}
              showAvatar={false}
              showName
              nameVariant="body1"
            />
            <Typography variant="caption" color="text.secondary" display="block">
              Friends since {new Date(friendship.since).toLocaleDateString()}
            </Typography>
          </FriendInfo>
          <RemoveButton
            variant="outlined"
            size="small"
            onClick={() => void handleRemove(friendship.user.id, friendship.user.username)}
          >
            Remove
          </RemoveButton>
        </FriendCard>
      ))}
    </FriendGrid>
  );
};
