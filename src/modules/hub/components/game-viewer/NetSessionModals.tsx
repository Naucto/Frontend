import { GameSessionConnectionResponseDto, GameSessionResponseDto } from "@api";
import { ConfirmDialog } from "@components/ui/ConfirmDialog";
import { StyledTable, StyledTableCell, StyledTableRow } from "@components/ui/StyledTable";
import { NetPermissions } from "@engine/net/NetPermissions";
import { SharedTableSession } from "@engine/net/SharedTableSession";
import {
  createGameSession,
  joinGameSession,
  joinGameSessionByCode,
  listGameSessions,
} from "@providers/net/gameSessionApi";
import { NetUiBridge, NetUiRequest } from "@providers/net/NetUiBridge";
import { buildSession } from "@providers/net/sessionFactory";
import { UserAvatar } from "@shared/user/UserAvatar";

import { type JSX, type ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PublicIcon from "@mui/icons-material/Public";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  TableBody,
  TableHead,
  TextField,
  Typography,
} from "@mui/material";

type Visibility = "PUBLIC" | "INVITE_CODE";
type JoinMode = "choose" | "code" | "public";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong";

// A failure pops its own modal rather than wedging an error line into the form.
const ErrorDialog = ({ title, message, onDismiss }: {
  title: string;
  message: string;
  onDismiss: () => void;
}): JSX.Element => (
  <ConfirmDialog open title={title} onClose={onDismiss} onConfirm={onDismiss} confirmLabel="OK" confirmColor="primary">
    <Typography>{message}</Typography>
  </ConfirmDialog>
);

const ChoiceCard = ({ icon, title, description, onClick }: {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}): JSX.Element => (
  <Card variant="outlined" sx={{ flex: 1 }}>
    <CardActionArea
      onClick={onClick}
      sx={{ p: 3, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 1 }}
    >
      {icon}
      <Typography variant="h6">{title}</Typography>
      <Typography variant="body2" color="text.secondary">{description}</Typography>
    </CardActionArea>
  </Card>
);

const HostDialog = ({ request, projectId, permissions }: { request: NetUiRequest; projectId: number; permissions?: NetPermissions }): JSX.Element => {
  const maxPlayers = request.hostOptions?.maxPlayers ?? 2;
  const [title, setTitle] = useState(request.hostOptions?.title ?? "My game");
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ session: SharedTableSession; joinCode: string } | null>(null);

  const host = async (): Promise<void> => {
    setBusy(true);

    try {
      const connection = await createGameSession({ projectId, title, maxPlayers, visibility });
      const session = buildSession(connection, "host", connection.playerId, permissions);

      if (connection.joinCode) {
        setPending({ session, joinCode: connection.joinCode });
        setBusy(false);
        return;
      }

      request.resolve(session);
    } catch (caught) {
      setError(messageOf(caught));
      setBusy(false);
    }
  };

  if (error)
    return <ErrorDialog title="Couldn't host the session" message={error} onDismiss={() => setError(null)} />;

  if (pending) {
    return (
      <ConfirmDialog
        open
        title="Session ready"
        onClose={() => request.resolve(null)}
        onConfirm={() => request.resolve(pending.session)}
        confirmLabel="Start"
        confirmColor="primary"
      >
        <Typography>Share this code so others can join:</Typography>
        <Typography variant="h4" sx={{ mt: 1, letterSpacing: 4, fontFamily: "monospace" }}>{pending.joinCode}</Typography>
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      open
      title="Host a session"
      onClose={() => request.resolve(null)}
      onConfirm={host}
      confirmLabel={busy ? "Hosting…" : "Host"}
      confirmColor="primary"
      confirmDisabled={busy}
    >
      <TextField label="Title" fullWidth value={title} onChange={event => setTitle(event.target.value)} sx={{ mt: 1 }} />
      <Typography sx={{ mt: 3 }}>Up to {maxPlayers} players (set by the game).</Typography>

      <RadioGroup value={visibility} onChange={event => setVisibility(event.target.value as Visibility)} sx={{ mt: 2 }}>
        <FormControlLabel value="PUBLIC" control={<Radio />} label="Anyone (public)" />
        <FormControlLabel value="INVITE_CODE" control={<Radio />} label="Invite code only" />
      </RadioGroup>
    </ConfirmDialog>
  );
};

const JoinDialog = ({ request, projectId, selfJoin }: {
  request: NetUiRequest;
  projectId: number;
  selfJoin?: boolean;
}): JSX.Element => {
  const [mode, setMode] = useState<JoinMode>("choose");
  const [sessions, setSessions] = useState<GameSessionResponseDto[]>([]);
  const [query, setQuery] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = (): void => request.resolve(null);

  const loadSessions = (): void => {
    listGameSessions(projectId).then(setSessions).catch(caught => setError(messageOf(caught)));
  };

  useEffect(() => {
    if (mode === "public")
      loadSessions();
  }, [mode, projectId]);

  const connect = async (open: () => Promise<GameSessionConnectionResponseDto>): Promise<void> => {
    setBusy(true);

    try {
      const connection = await open();
      request.resolve(buildSession(connection, "slave", connection.playerId));
    } catch (caught) {
      setError(messageOf(caught));
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q)
      return sessions;

    return sessions.filter(session =>
      [session.title, session.hostUsername, session.hostNickname]
        .some(field => field?.toLowerCase().includes(q))
    );
  }, [sessions, query]);

  if (error)
    return <ErrorDialog title="Couldn't join the session" message={error} onDismiss={() => setError(null)} />;

  if (mode === "choose") {
    return (
      <Dialog open onClose={cancel} maxWidth="sm" fullWidth>
        <DialogTitle>Join a session</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
            <ChoiceCard
              icon={<VpnKeyIcon color="primary" sx={{ fontSize: 40 }} />}
              title="Invite code"
              description="Join a private session with a code you were given."
              onClick={() => setMode("code")}
            />
            <ChoiceCard
              icon={<PublicIcon color="primary" sx={{ fontSize: 40 }} />}
              title="Public game"
              description="Browse and join an open session for this game."
              onClick={() => setMode("public")}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancel}>Cancel</Button>
        </DialogActions>
      </Dialog>
    );
  }

  if (mode === "code") {
    return (
      <Dialog open onClose={cancel} maxWidth="sm" fullWidth>
        <DialogTitle>Join with an invite code</DialogTitle>
        <DialogContent>
          <TextField label="Invite code" fullWidth value={code} onChange={event => setCode(event.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between" }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => setMode("choose")}>Back</Button>
          <Button
            variant="contained"
            disabled={busy || !code}
            onClick={() => connect(() => joinGameSessionByCode(code, selfJoin))}
          >
            Join
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={cancel} maxWidth="sm" fullWidth>
      <DialogTitle>Public sessions</DialogTitle>
      <DialogContent>
        <TextField
          placeholder="Search by host or session"
          fullWidth
          size="small"
          value={query}
          onChange={event => setQuery(event.target.value)}
          sx={{ mt: 1, mb: 1 }}
        />

        {filtered.length === 0 ? (
          <Typography sx={{ mt: 2 }}>No public sessions match.</Typography>
        ) : (
          <StyledTable size="small">
            <TableHead>
              <StyledTableRow>
                <StyledTableCell>Session</StyledTableCell>
                <StyledTableCell>Host</StyledTableCell>
                <StyledTableCell>Players</StyledTableCell>
                <StyledTableCell />
              </StyledTableRow>
            </TableHead>
            <TableBody>
              {filtered.map(session => (
                <StyledTableRow key={session.sessionUuid}>
                  <StyledTableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{session.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{session.projectName}</Typography>
                  </StyledTableCell>
                  <StyledTableCell>
                    <UserAvatar
                      username={session.hostUsername}
                      nickname={session.hostNickname}
                      fallbackLabel={`Player ${session.hostId}`}
                      showName
                    />
                  </StyledTableCell>
                  <StyledTableCell>{session.playerCount}/{session.maxPlayers}</StyledTableCell>
                  <StyledTableCell>
                    <Button
                      variant="contained"
                      size="small"
                      disabled={busy}
                      onClick={() => connect(() => joinGameSession(session.sessionUuid, undefined, selfJoin))}
                    >
                      Join
                    </Button>
                  </StyledTableCell>
                </StyledTableRow>
              ))}
            </TableBody>
          </StyledTable>
        )}
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between" }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => setMode("choose")}>Back</Button>
        <Button onClick={loadSessions}>Refresh</Button>
      </DialogActions>
    </Dialog>
  );
};

export const NetSessionModals = ({ bridge, projectId, selfJoin, permissions }: {
  bridge: NetUiBridge;
  projectId: number;
  selfJoin?: boolean;
  permissions?: NetPermissions;
}): JSX.Element | null => {
  const request = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);

  if (!request)
    return null;

  if (request.kind === "host")
    return <HostDialog request={request} projectId={projectId} permissions={permissions} />;

  return <JoinDialog request={request} projectId={projectId} selfJoin={selfJoin} />;
};
