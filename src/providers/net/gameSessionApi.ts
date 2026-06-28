import {
  CreateGameSessionDto,
  GameSessionConnectionResponseDto,
  GameSessionResponseDto,
  multiplayerControllerCreate,
  multiplayerControllerJoin,
  multiplayerControllerJoinByCode,
  multiplayerControllerLeave,
  multiplayerControllerList,
  multiplayerControllerRefreshTicket,
} from "@api";
import { GameSessionError } from "@errors/GameSessionError";

const messageOf = (error: unknown, fallback: string): string => {
  const candidate = (error as { message?: unknown })?.message;
  return typeof candidate === "string" ? candidate : fallback;
};

export const createGameSession = async (
  body: CreateGameSessionDto,
): Promise<GameSessionConnectionResponseDto> => {
  const { data, error } = await multiplayerControllerCreate({ body });
  if (error || !data) {
    throw new GameSessionError(messageOf(error, "Failed to create game session"));
  }
  return data;
};

export const joinGameSession = async (
  sessionUuid: string,
  joinCode?: string,
  editorTest?: boolean,
): Promise<GameSessionConnectionResponseDto> => {
  const { data, error } = await multiplayerControllerJoin({
    path: { sessionId: sessionUuid },
    body: { joinCode, editorTest },
  });
  if (error || !data) {
    throw new GameSessionError(messageOf(error, "Failed to join game session"));
  }
  return data;
};

export const joinGameSessionByCode = async (
  joinCode: string,
  editorTest?: boolean,
): Promise<GameSessionConnectionResponseDto> => {
  const { data, error } = await multiplayerControllerJoinByCode({ body: { joinCode, editorTest } });
  if (error || !data) {
    throw new GameSessionError(messageOf(error, "Failed to join with that code"));
  }
  return data;
};

export const refreshSessionTicket = async (
  sessionUuid: string,
): Promise<GameSessionConnectionResponseDto> => {
  const { data, error } = await multiplayerControllerRefreshTicket({ path: { sessionId: sessionUuid } });
  if (error || !data) {
    throw new GameSessionError(messageOf(error, "Failed to refresh session ticket"));
  }
  return data;
};

export const listGameSessions = async (
  projectId: number,
): Promise<GameSessionResponseDto[]> => {
  const { data, error } = await multiplayerControllerList({ query: { projectId } });
  if (error || !data) {
    throw new GameSessionError(messageOf(error, "Failed to list game sessions"));
  }
  return data.sessions;
};

export const leaveGameSession = async (sessionUuid: string): Promise<void> => {
  const { error } = await multiplayerControllerLeave({ path: { sessionId: sessionUuid } });
  if (error) {
    throw new GameSessionError(messageOf(error, "Failed to leave game session"));
  }
};
