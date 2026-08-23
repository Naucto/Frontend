import {
  friendControllerAcceptFriendRequest,
  friendControllerCancelOrRejectFriendRequest,
  friendControllerGetReceivedRequests,
  friendControllerGetSentRequests,
  type FriendRequestResponseDto,
} from "@api";
import { useAsync } from "@hooks/useAsync";
import { UserProfileLink } from "@shared/user/UserProfileLink";

import { JSX, useCallback, useState } from "react";

import { Avatar, Box, Button, CircularProgress, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import { useSnackbar } from "notistack";

const Section = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(4),
}));

const SectionTitle = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[300],
  marginBottom: theme.spacing(2),
}));

const RequestCard = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(2),
  padding: theme.spacing(2),
  borderRadius: theme.spacing(1),
  backgroundColor: theme.palette.gray[700],
  border: `1px solid ${theme.palette.gray[500]}`,
  marginBottom: theme.spacing(1.5),
}));

const RequestAvatar = styled(Avatar)(({ theme }) => ({
  width: theme.spacing(5.5),
  height: theme.spacing(5.5),
  backgroundColor: theme.palette.blue[700],
  border: `2px solid ${theme.palette.gray[400]}`,
  flexShrink: 0,
}));

const RequestInfo = styled(Box)({
  flex: 1,
  minWidth: 0,
});

const ActionRow = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(1),
  flexShrink: 0,
}));

const AcceptButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.blue[600],
  color: theme.palette.common.white,
  fontSize: "12px",
  padding: theme.spacing(0.5, 1.5),
  "&:hover": {
    backgroundColor: theme.palette.blue[500],
  },
}));

const DeclineButton = styled(Button)(({ theme }) => ({
  color: theme.palette.grey[300],
  borderColor: theme.palette.gray[500],
  fontSize: "12px",
  padding: theme.spacing(0.5, 1.5),
  "&:hover": {
    borderColor: theme.palette.grey[400],
  },
}));

const EmptyState = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[500],
  padding: theme.spacing(2, 0),
  fontStyle: "italic",
}));

type FriendRequestListProps = {
  onFriendAdded?: () => void;
};

const ReceivedRequestCard = ({
  request,
  onAccept,
  onDecline,
}: {
  request: FriendRequestResponseDto;
  onAccept: (id: number, username: string) => void;
  onDecline: (id: number, username: string) => void;
}): JSX.Element => (
  <RequestCard>
    <RequestAvatar src={request.from.profileImageUrl ?? undefined}>
      {request.from.username.charAt(0).toUpperCase()}
    </RequestAvatar>
    <RequestInfo>
      <UserProfileLink
        user={{
          id: request.from.id,
          username: request.from.username,
          nickname: request.from.nickname,
          profileImageUrl: request.from.profileImageUrl,
        }}
        showName
        nameVariant="body2"
      />
      <Typography variant="caption" color="text.secondary" display="block">
        {new Date(request.createdAt).toLocaleDateString()}
      </Typography>
    </RequestInfo>
    <ActionRow>
      <AcceptButton variant="contained" size="small" onClick={() => onAccept(request.id, request.from.username)}>
        Accept
      </AcceptButton>
      <DeclineButton variant="outlined" size="small" onClick={() => onDecline(request.id, request.from.username)}>
        Decline
      </DeclineButton>
    </ActionRow>
  </RequestCard>
);

const SentRequestCard = ({
  request,
  onCancel,
}: {
  request: FriendRequestResponseDto;
  onCancel: (id: number, username: string) => void;
}): JSX.Element => (
  <RequestCard>
    <RequestAvatar src={request.to.profileImageUrl ?? undefined}>
      {request.to.username.charAt(0).toUpperCase()}
    </RequestAvatar>
    <RequestInfo>
      <UserProfileLink
        user={{
          id: request.to.id,
          username: request.to.username,
          nickname: request.to.nickname,
          profileImageUrl: request.to.profileImageUrl,
        }}
        showName
        nameVariant="body2"
      />
      <Typography variant="caption" color="text.secondary" display="block">
        Sent {new Date(request.createdAt).toLocaleDateString()}
      </Typography>
    </RequestInfo>
    <DeclineButton variant="outlined" size="small" onClick={() => onCancel(request.id, request.to.username)}>
      Cancel
    </DeclineButton>
  </RequestCard>
);

export const FriendRequestList = ({ onFriendAdded }: FriendRequestListProps): JSX.Element => {
  const { enqueueSnackbar } = useSnackbar();
  const [refresh, setRefresh] = useState(0);

  const { value: receivedResponse, loading: loadingReceived } = useAsync(
    () => friendControllerGetReceivedRequests<true>({ throwOnError: true }),
    [refresh]
  );

  const { value: sentResponse, loading: loadingSent } = useAsync(
    () => friendControllerGetSentRequests<true>({ throwOnError: true }),
    [refresh]
  );

  const received: FriendRequestResponseDto[] =
    (receivedResponse?.data as { data?: FriendRequestResponseDto[] } | undefined)?.data ?? [];
  const sent: FriendRequestResponseDto[] =
    (sentResponse?.data as { data?: FriendRequestResponseDto[] } | undefined)?.data ?? [];

  const handleAccept = useCallback(async (requestId: number, username: string): Promise<void> => {
    try {
      await friendControllerAcceptFriendRequest<true>({
        throwOnError: true,
        path: { requestId },
      });
      enqueueSnackbar(`You and ${username} are now friends!`, { variant: "success" });
      setRefresh((prev) => prev + 1);
      onFriendAdded?.();
    } catch {
      enqueueSnackbar("Failed to accept friend request", { variant: "error" });
    }
  }, [enqueueSnackbar, onFriendAdded]);

  const handleDeclineOrCancel = useCallback(async (requestId: number, username: string): Promise<void> => {
    try {
      await friendControllerCancelOrRejectFriendRequest<true>({
        throwOnError: true,
        path: { requestId },
      });
      enqueueSnackbar(`Request with ${username} removed`, { variant: "info" });
      setRefresh((prev) => prev + 1);
    } catch {
      enqueueSnackbar("Failed to remove request", { variant: "error" });
    }
  }, [enqueueSnackbar]);

  if (loadingReceived || loadingSent) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Section>
        <SectionTitle variant="subtitle1">
          Received ({received.length})
        </SectionTitle>
        {received.length === 0 ? (
          <EmptyState variant="body2">No pending friend requests.</EmptyState>
        ) : (
          received.map((req) => (
            <ReceivedRequestCard
              key={req.id}
              request={req}
              onAccept={(id, username) => void handleAccept(id, username)}
              onDecline={(id, username) => void handleDeclineOrCancel(id, username)}
            />
          ))
        )}
      </Section>

      <Section>
        <SectionTitle variant="subtitle1">
          Sent ({sent.length})
        </SectionTitle>
        {sent.length === 0 ? (
          <EmptyState variant="body2">No sent requests.</EmptyState>
        ) : (
          sent.map((req) => (
            <SentRequestCard
              key={req.id}
              request={req}
              onCancel={(id, username) => void handleDeclineOrCancel(id, username)}
            />
          ))
        )}
      </Section>
    </>
  );
};
