import { GameSessionConnectionResponseDto, GameSessionResponseDto } from "@api";
import { ConfirmDialog } from "@components/ui/ConfirmDialog";
import { SharedTableSession } from "@engine/net/SharedTableSession";
import {
  createGameSession,
  joinGameSession,
  joinGameSessionByCode,
  listGameSessions,
} from "@providers/net/gameSessionApi";
import { NetUiBridge, NetUiRequest } from "@providers/net/NetUiBridge";
import { buildSession } from "@providers/net/sessionFactory";
import { LocalStorageManager } from "@utils/LocalStorageManager";

import { type JSX, useEffect, useState, useSyncExternalStore } from "react";

import {
  Box,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";

type Visibility = "PUBLIC" | "INVITE_CODE";

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong";

const HostDialog = ({ request, projectId }: { request: NetUiRequest; projectId: number }): JSX.Element => {
  const maxPlayers = request.hostOptions?.maxPlayers ?? 2;
  const [title, setTitle] = useState(request.hostOptions?.title ?? "My game");
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ session: SharedTableSession; joinCode: string } | null>(null);

  const host = async (): Promise<void> => {
    setBusy(true);
    setError(null);

    try {
      const connection = await createGameSession({ projectId, title, maxPlayers, visibility });
      const session = buildSession(connection, "host", LocalStorageManager.getUserId());

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

      {error && <Typography color="error" sx={{ mt: 2 }}>{error}</Typography>}
    </ConfirmDialog>
  );
};

const JoinDialog = ({ request, projectId }: { request: NetUiRequest; projectId: number }): JSX.Element => {
  const [sessions, setSessions] = useState<GameSessionResponseDto[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listGameSessions(projectId).then(setSessions).catch(caught => setError(messageOf(caught)));
  }, [projectId]);

  const connect = async (connect: () => Promise<GameSessionConnectionResponseDto>): Promise<void> => {
    setBusy(true);
    setError(null);

    try {
      const connection = await connect();
      request.resolve(buildSession(connection, "slave", LocalStorageManager.getUserId()));
    } catch (caught) {
      setError(messageOf(caught));
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open
      title="Join a session"
      onClose={() => request.resolve(null)}
      onConfirm={() => connect(() => joinGameSessionByCode(code))}
      confirmLabel="Join by code"
      confirmColor="primary"
      confirmDisabled={busy || !code}
    >
      <TextField label="Invite code" fullWidth value={code} onChange={event => setCode(event.target.value)} sx={{ mt: 1 }} />

      <Typography sx={{ mt: 3 }}>Or browse public sessions:</Typography>

      {sessions.length === 0 && <Typography sx={{ mt: 1 }}>No public sessions open right now.</Typography>}

      <Box sx={{ mt: 2 }}>
        {sessions.map(session => (
          <Box key={session.sessionUuid} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1 }}>
            <Typography>{session.title} — {session.playerCount}/{session.maxPlayers}</Typography>
            <Button variant="contained" size="small" disabled={busy} onClick={() => connect(() => joinGameSession(session.sessionUuid))}>Join</Button>
          </Box>
        ))}
      </Box>

      {error && <Typography color="error" sx={{ mt: 2 }}>{error}</Typography>}
    </ConfirmDialog>
  );
};

export const NetSessionModals = ({ bridge, projectId }: { bridge: NetUiBridge; projectId: number }): JSX.Element | null => {
  const request = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);

  if (!request)
    return null;

  if (request.kind === "host")
    return <HostDialog request={request} projectId={projectId} />;

  return <JoinDialog request={request} projectId={projectId} />;
};
