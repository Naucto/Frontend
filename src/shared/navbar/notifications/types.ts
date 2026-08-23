export type NotificationItem = {
  id: string;
  userId: number;
  title: string | null;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
};
