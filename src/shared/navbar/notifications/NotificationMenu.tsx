import { Box, Menu, Typography, styled } from "@mui/material";
import { JSX } from "react";
import { NotificationItem } from "./types";

type NotificationMenuProps = {
  anchorEl: HTMLElement | undefined;
  open: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAsRead: (notificationId: string) => void;
};

const StyledMenu = styled(Menu)(({ theme }) => ({
  "& .MuiPaper-root": {
    boxShadow: "none",
    backgroundColor: theme.palette.gray[700],
    color: theme.palette.text.primary,
    borderRadius: theme.spacing(1),
    border: `3px solid ${theme.palette.gray[400]}`,
  },
  "& .MuiList-root": {
    padding: 0,
  },
  marginTop: theme.spacing(1),
}));

const MenuContent = styled(Box)(({ theme }) => ({
  minWidth: 280,
  maxWidth: 360,
  padding: theme.spacing(1.5),
}));

const NotificationEntry = styled(Box, {
  shouldForwardProp: (prop) => prop !== "read",
})<{ read: boolean }>(({ theme, read }) => ({
  padding: theme.spacing(1, 0),
  borderBottom: `1px solid ${theme.palette.gray[500]}`,
  cursor: "pointer",
  opacity: read ? 0.50 : 1,
  "&:last-of-type": {
    borderBottom: "none",
  },
}));

const EmptyState = styled(Typography)(({ theme }) => ({
  color: theme.palette.gray[300],
  padding: theme.spacing(1, 0),
}));

const NonImportantTypography = styled(Typography)(({ theme }) => ({
  color: theme.palette.gray[300],
}));

const ActionsRow = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(1),
  marginTop: theme.spacing(0.5),
}));

export const NotificationMenu = ({
  anchorEl,
  open,
  onClose,
  notifications,
  onMarkAsRead,
}: NotificationMenuProps): JSX.Element => {
  return (
    <StyledMenu anchorEl={anchorEl} open={open} onClose={onClose}>
      <MenuContent>
        <Typography variant="subtitle1">Notifications</Typography>
        {notifications.length === 0 ? (
          <EmptyState variant="body2">No notifications yet.</EmptyState>
        ) : (
          notifications.map((notification) => (
            <NotificationEntry
              key={notification.id}
              read={notification.read}
            >
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
          ))
        )}
      </MenuContent>
    </StyledMenu>
  );
};
