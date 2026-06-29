import { authControllerRefresh } from "@api";
import { client } from "@api/client.gen";
import { UserProvider } from "@providers/UserProvider";
import { AUTH_EXPIRED_EVENT } from "@utils/authEvents";
import { LocalStorageManager } from "@utils/LocalStorageManager";

import App from "./App";

import { createRoot } from "react-dom/client";

import { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import "./index.css";

type RetriableConfig = InternalAxiosRequestConfig & { _authRetried?: boolean };

const resolveBackendUrl = (): string => {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  if (import.meta.env.DEV && import.meta.env.VITE_BACKEND_PORT) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${import.meta.env.VITE_BACKEND_PORT}`;
  }
  return "";
};

client.setConfig({
  baseURL: resolveBackendUrl(),
  withCredentials: true,
  auth: () => LocalStorageManager.getToken(),
});

// On a 401 for an authenticated request, transparently refresh the access token
// (via the httpOnly refresh cookie) once and retry. If the refresh fails the
// session is truly gone, so clear it and signal a global logout.
client.instance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const url = config?.url ?? "";

    const refreshable =
      error.response?.status === 401 &&
      config !== undefined &&
      !config._authRetried &&
      !url.includes("/auth/") &&
      Boolean(LocalStorageManager.getToken());

    if (!refreshable)
      return Promise.reject(error);

    config!._authRetried = true;

    const { data } = await authControllerRefresh();
    if (data?.access_token) {
      LocalStorageManager.setToken(data.access_token);
      config!.headers.set("Authorization", `Bearer ${data.access_token}`);
      return client.instance.request(config!);
    }

    LocalStorageManager.setToken(undefined);
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    return Promise.reject(error);
  }
);

createRoot(document.getElementById("root")!).render(
  <UserProvider>
    <App />
  </UserProvider>
);
