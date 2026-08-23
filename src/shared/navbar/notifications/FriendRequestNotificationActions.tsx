import { NotificationItem } from "./types";

import { JSX, useState } from "react";

import { Button, styled } from "@mui/material";

const ActionButton = styled(Button)(({ theme }) => ({
  fontSize: "0.65rem",
  padding: theme.spacing(0.25, 1),
  minWidth: 0,
}));

export const isFriendRequestNotification = (notification: NotificationItem): boolean =>
  notification.title === "New friend request" &&
  typeof notification.metadata?.["requestId"] === "number";

type PendingAction = "accept" | "decline";

type FriendRequestNotificationActionsProps = {
  notification: NotificationItem;
  onAccept: (requestId: number, notificationId: string) => Promise<void>;
  onDecline: (requestId: number, notificationId: string) => Promise<void>;
};

export const FriendRequestNotificationActions = ({
  notification,
  onAccept,
  onDecline,
}: FriendRequestNotificationActionsProps): JSX.Element | null => {
  const [pending, setPending] = useState<PendingAction | null>(null);

  if (notification.read) return null;

  const requestId = notification.metadata?.["requestId"];
  if (typeof requestId !== "number") return null;

  const handleRequest = async (
    action: PendingAction,
    handler: (requestId: number, notificationId: string) => Promise<void>,
  ): Promise<void> => {
    if (pending) return;
    setPending(action);
    try {
      await handler(requestId, notification.id);
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <ActionButton
        size="small"
        variant="contained"
        disabled={pending !== null}
        onClick={(e) => {
          e.stopPropagation();
          handleRequest("accept", onAccept);
        }}
      >
        {pending === "accept" ? "..." : "Accept"}
      </ActionButton>
      <ActionButton
        size="small"
        variant="outlined"
        color="inherit"
        disabled={pending !== null}
        onClick={(e) => {
          e.stopPropagation();
          handleRequest("decline", onDecline);
        }}
      >
        {pending === "decline" ? "..." : "Decline"}
      </ActionButton>
    </>
  );
};
