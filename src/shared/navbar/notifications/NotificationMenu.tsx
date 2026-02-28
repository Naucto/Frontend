import { Box, Menu, Typography, styled } from "@mui/material";
import { JSX } from "react";
import { NotificationItem } from "./types";
import { NotificationListItem } from "./NotificationListItem";

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

const EmptyState = styled(Typography)(({ theme }) => ({
  color: theme.palette.gray[300],
  padding: theme.spacing(1, 0),
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
            <NotificationListItem
              key={notification.id}
              notification={notification}
              onMarkAsRead={onMarkAsRead}
            />
          ))
        )}
      </MenuContent>
    </StyledMenu>
  );
};
