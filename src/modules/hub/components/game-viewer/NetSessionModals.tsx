import { GameSessionResponseDto } from "@api";
import { SharedTableSession } from "@engine/net/SharedTableSession";
import { createGameSession, joinGameSession, listGameSessions } from "@providers/net/gameSessionApi";
import { NetUiBridge, NetUiRequest } from "@providers/net/NetUiBridge";
import { buildSession } from "@providers/net/sessionFactory";
import { CustomDialog } from "@shared/dialog/CustomDialog";
import { LocalStorageManager } from "@utils/LocalStorageManager";

import { type JSX, useEffect, useState, useSyncExternalStore } from "react";

import {
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";

type Visibility = "PUBLIC" | "INVITE_CODE";

// The 60s ticket has no refresh endpoint yet, so a session that drops past it
// ends rather than reconnecting. TODO(NCTO-23): mint a fresh ticket server-side.
const noRefresh = async (): Promise<null> => null;

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
      const session = buildSession(connection, "host", LocalStorageManager.getUserId(), noRefresh);

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
      <CustomDialog isOpen setIsOpen={() => request.resolve(null)} hideSubmitButton onClose={() => request.resolve(pending.session)}>
        <Typography variant="h6">Session ready</Typography>
        <Typography sx={{ mt: 2 }}>Share this code so others can join:</Typography>
        <Typography variant="h4" sx={{ mt: 1, letterSpacing: 4, fontFamily: "monospace" }}>{pending.joinCode}</Typography>
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 4 }}>
          <Button variant="contained" onClick={() => request.resolve(pending.session)}>Start</Button>
        </Box>
      </CustomDialog>
    );
  }

  return (
    <CustomDialog isOpen setIsOpen={() => request.resolve(null)} hideSubmitButton onClose={() => request.resolve(null)}>
      <Typography variant="h6">Host a session</Typography>

      <TextField label="Title" fullWidth value={title} onChange={event => setTitle(event.target.value)} sx={{ mt: 3 }} />
      <Typography sx={{ mt: 3 }}>Up to {maxPlayers} players (set by the game).</Typography>

      <RadioGroup value={visibility} onChange={event => setVisibility(event.target.value as Visibility)} sx={{ mt: 2 }}>
        <FormControlLabel value="PUBLIC" control={<Radio />} label="Anyone (public)" />
        <FormControlLabel value="INVITE_CODE" control={<Radio />} label="Invite code only" />
      </RadioGroup>

      {error && <Typography color="error" sx={{ mt: 2 }}>{error}</Typography>}

      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 4 }}>
        <Button onClick={() => request.resolve(null)} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={host} disabled={busy}>{busy ? <CircularProgress size={20} /> : "Host"}</Button>
      </Box>
    </CustomDialog>
  );
};

const JoinDialog = ({ request, projectId }: { request: NetUiRequest; projectId: number }): JSX.Element => {
  const [sessions, setSessions] = useState<GameSessionResponseDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listGameSessions(projectId).then(setSessions).catch(caught => setError(messageOf(caught)));
  }, [projectId]);

  const join = async (session: GameSessionResponseDto): Promise<void> => {
    setBusy(true);
    setError(null);

    try {
      const connection = await joinGameSession(session.sessionUuid);
      request.resolve(buildSession(connection, "slave", LocalStorageManager.getUserId(), noRefresh));
    } catch (caught) {
      setError(messageOf(caught));
      setBusy(false);
    }
  };

  return (
    <CustomDialog isOpen setIsOpen={() => request.resolve(null)} hideSubmitButton onClose={() => request.resolve(null)}>
      <Typography variant="h6">Join a session</Typography>

      {sessions.length === 0 && <Typography sx={{ mt: 3 }}>No public sessions open right now.</Typography>}

      <Box sx={{ mt: 2 }}>
        {sessions.map(session => (
          <Box key={session.sessionUuid} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1 }}>
            <Typography>{session.title} — {session.playerCount}/{session.maxPlayers}</Typography>
            <Button variant="contained" size="small" disabled={busy} onClick={() => join(session)}>Join</Button>
          </Box>
        ))}
      </Box>

      {error && <Typography color="error" sx={{ mt: 2 }}>{error}</Typography>}

      <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 4 }}>
        <Button onClick={() => request.resolve(null)} disabled={busy}>Cancel</Button>
      </Box>
    </CustomDialog>
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
