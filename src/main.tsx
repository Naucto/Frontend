import { client } from "@api/client.gen";
import { UserProvider } from "@providers/UserProvider";
import { LocalStorageManager } from "@utils/LocalStorageManager";

import App from "./App";

import { createRoot } from "react-dom/client";

import "./index.css";

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

createRoot(document.getElementById("root")!).render(
  <UserProvider>
    <App />
  </UserProvider>
);
