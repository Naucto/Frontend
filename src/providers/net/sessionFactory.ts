import { GameSessionConnectionResponseDto } from "@api";
import { SessionRole, UserId } from "@engine/net/SessionTransport";
import { SharedTableSession } from "@engine/net/SharedTableSession";

import { refreshSessionTicket } from "./gameSessionApi";
import { RefreshedTicket } from "./SessionSignalingSocket";
import { SyncedSessionTransport } from "./SyncedSessionTransport";

export const buildSession = (
  connection: GameSessionConnectionResponseDto,
  role: SessionRole,
  selfUserId: UserId,
): SharedTableSession => {
  // The generated client types username/credential as objects, but they are
  // strings at runtime; narrow on type rather than force-casting.
  const iceServers: RTCIceServer[] = connection.webrtcConfig.peerOpts.config.iceServers.map(server => ({
    urls: server.urls,
    username: typeof server.username === "string" ? server.username : undefined,
    credential: typeof server.credential === "string" ? server.credential : undefined,
  }));

  const refreshTicket = async (): Promise<RefreshedTicket | null> => {
    try {
      const fresh = await refreshSessionTicket(connection.sessionUuid);
      return { ticket: fresh.connectionTicket, issuedAt: Date.now() };
    } catch {
      return null;
    }
  };

  const transport = new SyncedSessionTransport({
    role,
    selfUserId,
    signalingUrl: connection.webrtcConfig.signaling[0]!,
    ticket: connection.connectionTicket,
    ticketIssuedAt: Date.now(),
    iceServers,
    refreshTicket,
  });

  return new SharedTableSession(transport);
};
