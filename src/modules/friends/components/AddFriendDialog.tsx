import {
  friendControllerGetFriendshipStatus,
  friendControllerSendFriendRequest,
  type FriendshipStatusDto,
  type PublicUserProfileDto,
  userPublicControllerGetPublicProfileByUsername,
} from "@api";
import { useUser } from "@providers/UserProvider";
import * as urls from "@shared/navigation/routes";

import { JSX, useCallback, useEffect, useRef, useState } from "react";

import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import { styled } from "@mui/material/styles";
import { useSnackbar } from "notistack";
import { Link } from "react-router-dom";

const ResultCard = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: theme.spacing(2),
  padding: theme.spacing(2),
  borderRadius: theme.spacing(1),
  backgroundColor: theme.palette.gray[700],
  border: `1px solid ${theme.palette.gray[500]}`,
  marginTop: theme.spacing(2),
}));

const UserAvatar = styled(Avatar)(({ theme }) => ({
  width: theme.spacing(6),
  height: theme.spacing(6),
  backgroundColor: theme.palette.blue[700],
  border: `2px solid ${theme.palette.gray[400]}`,
  flexShrink: 0,
}));

const UserInfo = styled(Box)({
  flex: 1,
  minWidth: 0,
});

const SendButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.blue[600],
  color: theme.palette.common.white,
  "&:hover": {
    backgroundColor: theme.palette.blue[500],
  },
  "&:disabled": {
    backgroundColor: theme.palette.gray[600],
    color: theme.palette.grey[400],
  },
}));

const StatusText = styled(Typography)(({ theme }) => ({
  color: theme.palette.grey[400],
  fontSize: "13px",
}));

const DEBOUNCE_MS = 500;

type SearchState =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "found"; profile: PublicUserProfileDto; status: FriendshipStatusDto }
  | { kind: "not_found" }
  | { kind: "error" };

type AddFriendDialogProps = {
  open: boolean;
  onClose: () => void;
  onRequestSent: () => void;
};

export const AddFriendDialog = ({ open, onClose, onRequestSent }: AddFriendDialogProps): JSX.Element => {
  const { user } = useUser();
  const { enqueueSnackbar } = useSnackbar();
  const [username, setUsername] = useState("");
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  const [sending, setSending] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lookupUser = useCallback(async (query: string): Promise<void> => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearch({ kind: "idle" });
      return;
    }
    setSearch({ kind: "searching" });
    try {
      const profileRes = await userPublicControllerGetPublicProfileByUsername<true>({
        throwOnError: true,
        path: { username: trimmed },
      });
      const profile = (profileRes.data as { data: PublicUserProfileDto }).data;

      let status: FriendshipStatusDto = { status: "NONE" };
      if (user && profile.id !== user.id) {
        try {
          const statusRes = await friendControllerGetFriendshipStatus<true>({
            throwOnError: true,
            path: { userId: profile.id },
          });
          status = (statusRes.data as { data: FriendshipStatusDto }).data;
        } catch {
          // status stays NONE
        }
      }

      setSearch({ kind: "found", profile, status });
    } catch {
      setSearch({ kind: "not_found" });
    }
  }, [user]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!username.trim()) {
      setSearch({ kind: "idle" });
      return;
    }
    debounceRef.current = setTimeout(() => {
      void lookupUser(username);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username, lookupUser]);

  const handleClose = (): void => {
    setUsername("");
    setSearch({ kind: "idle" });
    onClose();
  };

  const handleSend = async (): Promise<void> => {
    if (search.kind !== "found") return;
    setSending(true);
    try {
      await friendControllerSendFriendRequest<true>({
        throwOnError: true,
        path: { userId: search.profile.id },
      });
      enqueueSnackbar(`Friend request sent to ${search.profile.username}!`, { variant: "success" });
      setSearch({ kind: "found", profile: search.profile, status: { status: "REQUEST_SENT" } });
      onRequestSent();
    } catch {
      enqueueSnackbar("Failed to send friend request", { variant: "error" });
    } finally {
      setSending(false);
    }
  };

  const isSelf = search.kind === "found" && user?.id === search.profile.id;

  const renderActionButton = (): JSX.Element | null => {
    if (search.kind !== "found") return null;
    if (isSelf) return <StatusText>That&apos;s you!</StatusText>;

    switch (search.status.status) {
      case "FRIENDS":
        return <StatusText>Already friends</StatusText>;
      case "REQUEST_SENT":
        return <StatusText>Request sent</StatusText>;
      case "REQUEST_RECEIVED":
        return <StatusText>Request received — check your Requests tab</StatusText>;
      default:
        return (
          <SendButton variant="contained" size="small" onClick={() => void handleSend()} disabled={sending}>
            {sending ? <CircularProgress size={16} color="inherit" /> : "Send Request"}
          </SendButton>
        );
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add a Friend</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label="Search by username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          slotProps={{
            input: {
              endAdornment: search.kind === "searching" ? (
                <InputAdornment position="end">
                  <CircularProgress size={18} />
                </InputAdornment>
              ) : null,
            },
          }}
          sx={{ mt: 1 }}
        />

        {search.kind === "not_found" && username.trim() && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: "italic" }}>
            No user found with that username.
          </Typography>
        )}

        {search.kind === "found" && (
          <ResultCard>
            <Link to={urls.toProfileByUsername(search.profile.username)} style={{ textDecoration: "none" }} onClick={handleClose}>
              <UserAvatar src={search.profile.profileImageUrl ?? undefined}>
                {search.profile.username.charAt(0).toUpperCase()}
              </UserAvatar>
            </Link>
            <UserInfo>
              <Typography variant="body1" fontWeight={600} color="common.white">
                {search.profile.nickname ?? search.profile.username}
              </Typography>
              {search.profile.nickname && (
                <Typography variant="caption" color="text.secondary">
                  @{search.profile.username}
                </Typography>
              )}
            </UserInfo>
            {renderActionButton()}
          </ResultCard>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="inherit">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
