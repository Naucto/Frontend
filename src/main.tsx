import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { UserProvider } from "@providers/UserProvider.tsx";
import { OpenAPI } from "@api";
import { LocalStorageManager } from "@utils/LocalStorageManager";

OpenAPI.BASE = import.meta.env.VITE_BACKEND_URL ?? "";
OpenAPI.TOKEN = () => Promise.resolve(LocalStorageManager.getToken());

createRoot(document.getElementById("root")!).render(
  <UserProvider>
    <App />
  </UserProvider>,
);
