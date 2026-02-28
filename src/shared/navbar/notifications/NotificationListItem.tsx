import { Box, Typography, styled } from "@mui/material";
import { JSX } from "react";
import { NotificationItem } from "./types";

const NotificationEntry = styled(Box, {
  shouldForwardProp: (prop) => prop !== "read",
})<{ read: boolean }>(({ theme, read }) => ({
  padding: theme.spacing(1, 0),
  borderBottom: `1px solid ${theme.palette.gray[500]}`,
  cursor: "pointer",
  opacity: read ? 0.5 : 1,
  "&:last-of-type": {
    borderBottom: "none",
  },
}));

const NonImportantTypography = styled(Typography)(({ theme }) => ({
  color: theme.palette.gray[300],
}));

const ActionsRow = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(1),
  marginTop: theme.spacing(0.5),
}));

type NotificationListItemProps = {
  notification: NotificationItem;
  onMarkAsRead: (notificationId: string) => void;
};

export const NotificationListItem = ({
  notification,
  onMarkAsRead,
}: NotificationListItemProps): JSX.Element => (
  <NotificationEntry read={notification.read}>
    <Typography variant="body2" fontWeight={600}>
      {notification.title || notification.type}
    </Typography>
    <Typography variant="caption">
      {notification.message}
    </Typography>
    <NonImportantTypography variant="caption" display="block">
      {new Date(notification.createdAt).toLocaleString()}
    </NonImportantTypography>
    <ActionsRow>
      <Typography
        variant="caption"
        sx={{ cursor: "pointer", textDecoration: "underline" }}
        onClick={() => onMarkAsRead(notification.id)}
      >
        Mark as read
      </Typography>
    </ActionsRow>
  </NotificationEntry>
);
