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
}
