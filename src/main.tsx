import { client } from "@api/client.gen";
import { UserProvider } from "@providers/UserProvider";
import { LocalStorageManager } from "@utils/LocalStorageManager";

import App from "./App";

import { createRoot } from "react-dom/client";

import "./index.css";

// VITE_BACKEND_URL wins (prod/CI). Otherwise, in dev, target the same host the app is served from
// so it works over localhost and LAN alike; the port comes from dev.sh's docker lookup.
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
