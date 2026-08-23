import { friendControllerGetMyFriendCount } from "@api";
import { useAsync } from "@hooks/useAsync";
import { AddFriendDialog } from "@modules/friends/components/AddFriendDialog";
import { FriendList } from "@modules/friends/components/FriendList";
import { FriendRequestList } from "@modules/friends/components/FriendRequestList";
import { useUser } from "@providers/UserProvider";

import { JSX, useState } from "react";

import { Box, Button, Tab, Tabs, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";

const PageRoot = styled(Box)(({ theme }) => ({
  paddingLeft: theme.spacing(14),
  paddingRight: theme.spacing(14),
  paddingTop: theme.spacing(4),
  paddingBottom: theme.spacing(4),
}));

const PageTitle = styled(Typography)(({ theme }) => ({
  marginBottom: theme.spacing(3),
  color: theme.palette.common.white,
}));

const StyledTabs = styled(Tabs)(({ theme }) => ({
  borderBottom: `1px solid ${theme.palette.gray[600]}`,
  marginBottom: theme.spacing(3),
  "& .MuiTab-root": {
    color: theme.palette.grey[400],
    textTransform: "none",
    fontWeight: 600,
    "&.Mui-selected": {
      color: theme.palette.common.white,
    },
  },
  "& .MuiTabs-indicator": {
    backgroundColor: theme.palette.blue[500],
  },
}));

const TabContent = styled(Box)(({ theme }) => ({
  paddingTop: theme.spacing(1),
}));

const NotLoggedIn = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: theme.spacing(10, 2),
  gap: theme.spacing(2),
  color: theme.palette.grey[400],
}));

const PageHeader = styled(Box)({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});

const AddFriendButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.blue[600],
  color: theme.palette.common.white,
  fontWeight: 600,
  "&:hover": {
    backgroundColor: theme.palette.blue[500],
  },
}));

export const Friends = (): JSX.Element => {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState(0);
  const [friendCountRefresh, setFriendCountRefresh] = useState(0);
  const [addFriendOpen, setAddFriendOpen] = useState(false);

  const { value: countResponse } = useAsync(
    () => {
      if (!user) return Promise.resolve(null);
      return friendControllerGetMyFriendCount<true>({ throwOnError: true });
    },
    [user, friendCountRefresh]
  );

  const friendCount = (countResponse?.data as { data?: { count: number } } | null)?.data?.count ?? 0;

  if (!user) {
    return (
      <NotLoggedIn>
        <Typography variant="h5">Sign in to see your friends</Typography>
        <Typography variant="body2">You need to be logged in to access your friend list.</Typography>
      </NotLoggedIn>
    );
  }

  return (
    <PageRoot>
      <PageHeader>
        <PageTitle variant="h4">
          Friends {friendCount > 0 && (
            <Typography component="span" variant="h5" color="grey.500">
              ({friendCount})
            </Typography>
          )}
        </PageTitle>
        <AddFriendButton variant="contained" onClick={() => setAddFriendOpen(true)}>
          + Add Friend
        </AddFriendButton>
      </PageHeader>

      <AddFriendDialog
        open={addFriendOpen}
        onClose={() => setAddFriendOpen(false)}
        onRequestSent={() => {
          setAddFriendOpen(false);
          setActiveTab(1);
          setFriendCountRefresh((p) => p + 1);
        }}
      />

      <StyledTabs value={activeTab} onChange={(_e, v: number) => setActiveTab(v)} aria-label="Friends tabs">
        <Tab label="My Friends"/>
        <Tab label="Requests"/>
      </StyledTabs>

      <TabContent hidden={activeTab !== 0}>
        <FriendList onCountChange={() => setFriendCountRefresh((p) => p + 1)} />
      </TabContent>

      <TabContent hidden={activeTab !== 1}>
        <FriendRequestList onFriendAdded={() => setFriendCountRefresh((p) => p + 1)} />
      </TabContent>
    </PageRoot>
  );
};

export default Friends;
