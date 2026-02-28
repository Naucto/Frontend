import { Badge, IconButton, styled } from "@mui/material";
import { JSX, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import InfoBoxIcon from "@assets/infoBox.svg?react";
import { useUser } from "@providers/UserProvider";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import { NotificationMenu } from "./NotificationMenu";
import { NotificationItem } from "./types";
import { NotificationsService } from "@api/services/NotificationsService";

const NOTIFICATION_SOCKET_PATH = "/socket/notifications";
const MAX_NOTIFICATIONS = 50;

type NotificationWsMessage =
  | { type: "notification"; payload: NotificationItem }
  | { type: "notifications:init"; payload: NotificationItem[] };

const NotificationButton = styled(IconButton)(({ theme }) => ({
  margin: theme.spacing(2),
  color: theme.palette.text.primary,
}));

const InfoIcon = styled(InfoBoxIcon)(({ theme }) => ({
  width: 24,
  height: 24,
  color: theme.palette.text.primary,
}));

const mergeNotification = (
  previous: NotificationItem[],
  notification: NotificationItem,
): NotificationItem[] => {
  const withoutCurrent = previous.filter((item) => item.id !== notification.id);
  return [notification, ...withoutCurrent].slice(0, MAX_NOTIFICATIONS);
};

export const NotificationBox = (): JSX.Element => {
  const { user } = useUser();
  const userId = user?.id;
  const token = LocalStorageManager.getToken();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | undefined>(undefined);
  const socketRef = useRef<WebSocket | null>(null);
  const backendUrl = (import.meta.env.VITE_BACKEND_URL || "http://localhost:3000").trim();

  const unreadCount = useMemo(
    () => notifications.reduce((count, notification) => count + (notification.read ? 0 : 1), 0),
    [notifications],
  );

  useEffect(() => {
    if (!userId || !token || !backendUrl) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setNotifications([]);
      return;
    }

    const wsBase = backendUrl.replace(/^http/i, "ws").replace(/\/$/, "");
    const socketUrl = `${wsBase}${NOTIFICATION_SOCKET_PATH}`;
    const socket = new WebSocket(socketUrl);

    socketRef.current = socket;

    socket.onopen = () => {
      try {
        socket.send(JSON.stringify({ type: "auth", token }));
      } catch {
        // eslint-disable-next-line no-console
        console.warn("Failed to send auth message over websocket");
      }
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const message = JSON.parse(event.data) as NotificationWsMessage;

        if (message.type === "notifications:init") {
          setNotifications(message.payload.slice(0, MAX_NOTIFICATIONS));
          return;
        }

        if (message.type === "notification") {
          setNotifications((previous) => mergeNotification(previous, message.payload));
        }
      } catch {
        // eslint
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [userId, token, backendUrl]);

  const handleClick = useCallback((event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    setShowMenu((previous) => {
      const next = !previous;

      return next;
    });
  }, []);

  const handleClose = useCallback(() => setShowMenu(false), []);

  const handleMarkAsRead = useCallback((notificationId: string) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId ? { ...notification, read: true } : notification,
      ),
    );
    NotificationsService.notificationsControllerMarkAsRead(notificationId).catch(() => {
      // eslint-disable-next-line no-console
      console.error(`Failed to mark notification ${notificationId} as read`);
    });
  }, []);

  return (
    <>
      <NotificationButton onClick={handleClick} disabled={!userId}>
        <Badge badgeContent={unreadCount} color="error">
          <InfoIcon />
        </Badge>
      </NotificationButton>
      {showMenu && (
        <NotificationMenu
          anchorEl={anchorEl}
          open={showMenu}
          onClose={handleClose}
          notifications={notifications}
          onMarkAsRead={handleMarkAsRead}
        />
      )}
    </>
  );
};
