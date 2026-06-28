import { GameSessionConnectionResponseDto, GameSessionResponseDto } from "@api";
import { ConfirmDialog } from "@components/ui/ConfirmDialog";
import { StyledTable, StyledTableCell, StyledTableRow } from "@components/ui/StyledTable";
import { SharedTableSession } from "@engine/net/SharedTableSession";
import {
  createGameSession,
  joinGameSession,
  joinGameSessionByCode,
  listGameSessions,
} from "@providers/net/gameSessionApi";
import { NetUiBridge, NetUiRequest } from "@providers/net/NetUiBridge";
import { buildSession } from "@providers/net/sessionFactory";
import { usePublicUserProfile } from "@shared/user/usePublicUserProfile";

import { type JSX, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  Avatar,
  Box,
  Button,
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

const BackLink = ({ onClick }: { onClick: () => void }): JSX.Element => (
  <Button variant="text" size="small" onClick={onClick} sx={{ pl: 0, mb: 1 }}>← Back</Button>
);

// Avatar + name without UserProfileLink's navigation (which would leave the game).
const HostCell = ({ hostId, username, nickname }: {
  hostId: number;
  username: string;
  nickname?: string;
}): JSX.Element => {
  const profile = usePublicUserProfile(username);
  const name = profile?.nickname || nickname || profile?.username || username || `Player ${hostId}`;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Avatar src={profile?.profileImageUrl ?? ""} sx={{ width: 28, height: 28 }}>
        {name.charAt(0).toUpperCase()}
      </Avatar>
      <Typography variant="body2">{name}</Typography>
    </Box>
  );
};

const HostDialog = ({ request, projectId }: { request: NetUiRequest; projectId: number }): JSX.Element => {
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
      const session = buildSession(connection, "host", connection.playerId);

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
      [session.title, session.projectName, session.hostUsername, session.hostNickname]
        .some(field => field?.toLowerCase().includes(q))
    );
  }, [sessions, query]);

  if (error)
    return <ErrorDialog title="Couldn't join the session" message={error} onDismiss={() => setError(null)} />;

  if (mode === "choose") {
    return (
      <ConfirmDialog
        open
        title="Join a session"
        onClose={() => request.resolve(null)}
        onConfirm={() => setMode("public")}
        confirmLabel="Browse public games"
        confirmColor="primary"
      >
        <Typography sx={{ mb: 2 }}>How would you like to join?</Typography>
        <Button variant="outlined" fullWidth onClick={() => setMode("code")}>Join with an invite code</Button>
      </ConfirmDialog>
    );
  }

  if (mode === "code") {
    return (
      <ConfirmDialog
        open
        title="Join with an invite code"
        onClose={() => request.resolve(null)}
        onConfirm={() => connect(() => joinGameSessionByCode(code, selfJoin))}
        confirmLabel="Join"
        confirmColor="primary"
        confirmDisabled={busy || !code}
      >
        <BackLink onClick={() => setMode("choose")} />
        <TextField label="Invite code" fullWidth value={code} onChange={event => setCode(event.target.value)} />
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      open
      title="Public sessions"
      onClose={() => request.resolve(null)}
      onConfirm={loadSessions}
      confirmLabel="Refresh"
    >
      <BackLink onClick={() => setMode("choose")} />
      <TextField
        placeholder="Search by game or host"
        fullWidth
        size="small"
        value={query}
        onChange={event => setQuery(event.target.value)}
        sx={{ mb: 1 }}
      />

      {filtered.length === 0 ? (
        <Typography sx={{ mt: 2 }}>No public sessions match.</Typography>
      ) : (
        <StyledTable size="small">
          <TableHead>
            <StyledTableRow>
              <StyledTableCell>Host</StyledTableCell>
              <StyledTableCell>Game</StyledTableCell>
              <StyledTableCell>Players</StyledTableCell>
              <StyledTableCell />
            </StyledTableRow>
          </TableHead>
          <TableBody>
            {filtered.map(session => (
              <StyledTableRow key={session.sessionUuid}>
                <StyledTableCell>
                  <HostCell hostId={session.hostId} username={session.hostUsername} nickname={session.hostNickname} />
                </StyledTableCell>
                <StyledTableCell>{session.projectName}</StyledTableCell>
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
    </ConfirmDialog>
  );
};

export const NetSessionModals = ({ bridge, projectId, selfJoin }: {
  bridge: NetUiBridge;
  projectId: number;
  selfJoin?: boolean;
}): JSX.Element | null => {
  const request = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);

  if (!request)
    return null;

  if (request.kind === "host")
    return <HostDialog request={request} projectId={projectId} />;

  return <JoinDialog request={request} projectId={projectId} selfJoin={selfJoin} />;
};
