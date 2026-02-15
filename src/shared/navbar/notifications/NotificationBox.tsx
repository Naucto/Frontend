import { Badge, IconButton, styled } from "@mui/material";
import { JSX, useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import InfoBoxIcon from "@assets/inbox.svg?react";
import { useUser } from "@providers/UserProvider";
import { NotificationMenu } from "./NotificationMenu";
import { NotificationItem } from "./types";

const TEMP_NOTIFICATION_SOCKET_PATH = "/socket/notifications";
const MAX_NOTIFICATIONS = 20;
const WS_READY_STATE_OPEN = 1;

type NotificationWsMessage =
  | { type: "register"; userId: string }
  | { type: "notification"; payload: NotificationItem };

const NotificationButton = styled(IconButton)(({ theme }) => ({
  margin: theme.spacing(2),
  color: theme.palette.text.primary,
}));

const InfoIcon = styled(InfoBoxIcon)(({ theme }) => ({
  width: 24,
  height: 24,
  color: theme.palette.text.primary,
}));

export const NotificationBox = (): JSX.Element => {
  const { user } = useUser();
  const userId = user?.id;
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | undefined>(undefined);
  const socketRef = useRef<WebSocket | null>(null);
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  useEffect(() => {
    if (!userId || !backendUrl) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const wsBase = backendUrl.replace(/^http/i, "ws").replace(/\/$/, "");
    const socket = new WebSocket(
      `${wsBase}${TEMP_NOTIFICATION_SOCKET_PATH}?userId=${encodeURIComponent(String(userId))}`,
    );

    socketRef.current = socket;

    socket.onopen = () => {
      const registerMessage: NotificationWsMessage = { type: "register", userId: String(userId) };
      socket.send(JSON.stringify(registerMessage));
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const message = JSON.parse(event.data) as NotificationWsMessage;
        if (message.type !== "notification") return;
        setNotifications((prev) => [message.payload, ...prev].slice(0, MAX_NOTIFICATIONS));
        setUnreadCount((prev) => prev + 1);
      } catch {
        //
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [userId, backendUrl]);

  const handleClick = useCallback((event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    setShowMenu((prev) => {
      const next = !prev;
      if (next) {
        setUnreadCount(0);
        if (userId && socketRef.current?.readyState === WS_READY_STATE_OPEN) {
          const registerMessage: NotificationWsMessage = { type: "register", userId: String(userId) };
          socketRef.current.send(JSON.stringify(registerMessage));
        }
      }
      return next;
    });
  }, [userId]);

  const handleClose = useCallback(() => setShowMenu(false), []);

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
        />
      )}
    </>
  );
};
