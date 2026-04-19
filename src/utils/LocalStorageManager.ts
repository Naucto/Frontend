import { User } from "../types/userTypes";

export class LocalStorageManager {
  private static readonly USER_ID_KEY = "user_id";
  private static readonly USER_NAME_KEY = "user_name";
  private static readonly TOKEN_KEY = "token_access";

  static getUserId(): number {
    return Number(localStorage.getItem(this.USER_ID_KEY));
  }

  static getUserName(): string {
    return localStorage.getItem(this.USER_NAME_KEY) || "";
  }

  static setUser(user?: User): void {
    if (user) {
      localStorage.setItem(this.USER_ID_KEY, user.id);
      localStorage.setItem(this.USER_NAME_KEY, user.name || "");
    } else {
      localStorage.removeItem(this.USER_ID_KEY);
      localStorage.removeItem(this.USER_NAME_KEY);
    }
  }

  static setUserId(userId?: number): void {
    if (userId) {
      localStorage.setItem(this.USER_ID_KEY, String(userId));
    } else {
      localStorage.removeItem(this.USER_ID_KEY);
    }
  }

  static setUserName(userName?: string): void {
    if (userName) {
      localStorage.setItem(this.USER_NAME_KEY, userName);
    } else {
      localStorage.removeItem(this.USER_NAME_KEY);
    }
  }

  static getToken(): string {
    return localStorage.getItem(this.TOKEN_KEY) || "";
  }

  static setToken(token?: string): void {
    if (token) {
      localStorage.setItem(this.TOKEN_KEY, token);
    } else {
      localStorage.removeItem(this.TOKEN_KEY);
    }
  }

  static setProjectId(projectId?: number): void {
    if (projectId) {
      localStorage.setItem("project_id", String(projectId));
    } else {
      localStorage.removeItem("project_id");
    }
  }

  static resetUser(): void {
    LocalStorageManager.setUser(undefined);
    LocalStorageManager.setToken(undefined);
  }

  private static safeSetItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      console.warn(`Failed to write to localStorage for key: ${key}`);
    }
  }

  // ─── Liked Projects (anonymous like tracking) ─────────────────────────

  private static readonly LIKED_PROJECTS_KEY = "liked_projects";
  private static readonly PLAYED_PROJECTS_KEY = "played_projects";

  static getLikedProjects(): number[] {
    try {
      const raw = localStorage.getItem(this.LIKED_PROJECTS_KEY);
      return raw ? (JSON.parse(raw) as number[]) : [];
    } catch {
      return [];
    }
  }

  static addLikedProject(id: number): void {
    const liked = this.getLikedProjects();
    if (!liked.includes(id)) {
      liked.push(id);
      this.safeSetItem(this.LIKED_PROJECTS_KEY, JSON.stringify(liked));
    }
  }

  static removeLikedProject(id: number): void {
    const liked = this.getLikedProjects().filter((pid) => pid !== id);
    this.safeSetItem(this.LIKED_PROJECTS_KEY, JSON.stringify(liked));
  }

  static isProjectLiked(id: number): boolean {
    return this.getLikedProjects().includes(id);
  }

  static getPlayedProjects(): number[] {
    try {
      const raw = localStorage.getItem(this.PLAYED_PROJECTS_KEY);
      return raw ? (JSON.parse(raw) as number[]) : [];
    } catch {
      return [];
    }
  }

  static addPlayedProject(id: number): void {
    const played = this.getPlayedProjects().filter((projectId) => projectId !== id);
    played.unshift(id);
    this.safeSetItem(
      this.PLAYED_PROJECTS_KEY,
      JSON.stringify(played)
    );
  }
}
