export type User = {
  id: string;
  name: string;
  email?: string;
  token?: string;
  refreshToken?: string;
  projectId?: number;
};

export type EngineUser = {
  clientId: number;
  userId: number;
  name: string;
  color: string;
};
