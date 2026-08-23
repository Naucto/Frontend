import {
  friendControllerAcceptFriendRequest,
  friendControllerCancelOrRejectFriendRequest,
  friendControllerGetFriendshipStatus,
  friendControllerRemoveFriend,
  friendControllerSendFriendRequest,
  type FriendshipStatusDto,
} from "@api";
import { useAsync } from "@hooks/useAsync";
import ImportantButton from "@shared/buttons/ImportantButton";

import { JSX, useCallback, useState } from "react";

import { Box, styled } from "@mui/material";
import { useSnackbar } from "notistack";

const HorizontalBox = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "row",
  gap: theme.spacing(1),
}));

const FriendButton = styled(ImportantButton)();

type ProfileFriendActionsProps = {
  profileId: number;
  isOtherProfile: boolean;
};

export const ProfileFriendActions = ({ profileId, isOtherProfile }: ProfileFriendActionsProps): JSX.Element | null => {
  const { enqueueSnackbar } = useSnackbar();
  const [friendRefresh, setFriendRefresh] = useState(0);

  const { value: friendStatusResponse } = useAsync(
    () => {
      if (!isOtherProfile) return Promise.resolve(null);
      return friendControllerGetFriendshipStatus<true>({
        throwOnError: true,
        path: { userId: profileId },
      });
    },
    [isOtherProfile, profileId, friendRefresh],
  );

  const friendStatus = (friendStatusResponse?.data as { data?: FriendshipStatusDto } | null)?.data ?? null;

  const handleSendFriendRequest = useCallback(async (): Promise<void> => {
    try {
      await friendControllerSendFriendRequest<true>({
        throwOnError: true,
        path: { userId: profileId },
      });
      enqueueSnackbar("Friend request sent!", { variant: "success" });
      setFriendRefresh((p) => p + 1);
    } catch {
      enqueueSnackbar("Failed to send friend request", { variant: "error" });
    }
  }, [profileId, enqueueSnackbar]);

  const handleCancelRequest = useCallback(async (): Promise<void> => {
    if (!friendStatus?.requestId) return;
    try {
      await friendControllerCancelOrRejectFriendRequest<true>({
        throwOnError: true,
        path: { requestId: friendStatus.requestId },
      });
      enqueueSnackbar("Friend request cancelled", { variant: "info" });
      setFriendRefresh((p) => p + 1);
    } catch {
      enqueueSnackbar("Failed to cancel request", { variant: "error" });
    }
  }, [friendStatus, enqueueSnackbar]);

  const handleAcceptRequest = useCallback(async (): Promise<void> => {
    if (!friendStatus?.requestId) return;
    try {
      await friendControllerAcceptFriendRequest<true>({
        throwOnError: true,
        path: { requestId: friendStatus.requestId },
      });
      enqueueSnackbar("Friend request accepted!", { variant: "success" });
      setFriendRefresh((p) => p + 1);
    } catch {
      enqueueSnackbar("Failed to accept request", { variant: "error" });
    }
  }, [friendStatus, enqueueSnackbar]);

  const handleRemoveFriend = useCallback(async (): Promise<void> => {
    try {
      await friendControllerRemoveFriend<true>({
        throwOnError: true,
        path: { userId: profileId },
      });
      enqueueSnackbar("Friend removed", { variant: "info" });
      setFriendRefresh((p) => p + 1);
    } catch {
      enqueueSnackbar("Failed to remove friend", { variant: "error" });
    }
  }, [profileId, enqueueSnackbar]);

  if (!isOtherProfile || !friendStatus) return null;

  return (
    <HorizontalBox>
      {friendStatus.status === "NONE" && (
        <FriendButton type="button" onClick={() => void handleSendFriendRequest()}>
          Add Friend
        </FriendButton>
      )}
      {friendStatus.status === "REQUEST_SENT" && (
        <FriendButton type="button" onClick={() => void handleCancelRequest()}>
          Request Sent
        </FriendButton>
      )}
      {friendStatus.status === "REQUEST_RECEIVED" && (
        <>
          <FriendButton type="button" onClick={() => void handleAcceptRequest()}>
            Accept Request
          </FriendButton>
          <FriendButton type="button" onClick={() => void handleCancelRequest()}>
            Decline
          </FriendButton>
        </>
      )}
      {friendStatus.status === "FRIENDS" && (
        <FriendButton type="button" onClick={() => void handleRemoveFriend()}>
          Remove Friend
        </FriendButton>
      )}
    </HorizontalBox>
  );
};
