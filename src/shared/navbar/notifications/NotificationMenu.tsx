import { Box, Menu, Typography, styled } from "@mui/material";
import { NotificationItem } from "./types";
import { JSX } from "react";

type NotificationMenuProps = {
  anchorEl: HTMLElement | undefined;
  open: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
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

const NotificationEntry = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1, 0),
  borderBottom: `1px solid ${theme.palette.gray[500]}`,
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

export const NotificationMenu = ({
  anchorEl,
  open,
  onClose,
  notifications,
}: NotificationMenuProps): JSX.Element => {

  // TODO: remove temporary test
  //append notification for test
  // notifications.push({
  //   id: "1",
  //   title: "New Message",
  //   message: "You have received a new message from John.",
  //   createdAt: new Date().toISOString(),
  // });

  return (
    <StyledMenu anchorEl={anchorEl} open={open} onClose={onClose}>
      <MenuContent>
        <Typography variant="subtitle1">Notifications</Typography>
        {notifications.length === 0 ? (
          <EmptyState variant="body2">No notidqsdqfications yet.</EmptyState>
        ) : (
          notifications.map((notification) => (
            <NotificationEntry key={notification.id}>
              <Typography variant="body2" fontWeight={600}>
                {notification.title}
              </Typography>
              <Typography variant="caption">
                {notification.message}
              </Typography>
              <NonImportantTypography variant="caption" display="block">
                {new Date(notification.createdAt).toLocaleString()}
              </NonImportantTypography>
            </NotificationEntry>
          ))
        )}
      </MenuContent>
    </StyledMenu>
  );
};
