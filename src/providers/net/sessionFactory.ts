import { GameSessionConnectionResponseDto } from "@api";
import { SessionRole, UserId } from "@engine/net/SessionTransport";
import { SharedTableSession } from "@engine/net/SharedTableSession";

import { RefreshedTicket } from "./SessionSignalingSocket";
import { SyncedSessionTransport } from "./SyncedSessionTransport";

export const buildSession = (
  connection: GameSessionConnectionResponseDto,
  role: SessionRole,
  selfUserId: UserId,
  refreshTicket: () => Promise<RefreshedTicket | null>,
): SharedTableSession => {
  // username/credential are typed as objects by the generated client but are
  // strings at runtime.
  const iceServers: RTCIceServer[] = connection.webrtcConfig.peerOpts.config.iceServers.map(server => ({
    urls: server.urls,
    username: server.username as unknown as string | undefined,
    credential: server.credential as unknown as string | undefined,
  }));

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
