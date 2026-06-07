import { client } from "@api/client.gen";
import { UserProvider } from "@providers/UserProvider";
import { LocalStorageManager } from "@utils/LocalStorageManager";

import App from "./App";

import { createRoot } from "react-dom/client";

import "./index.css";

client.setConfig({
  baseURL: import.meta.env.VITE_BACKEND_URL ?? "",
  auth: () => LocalStorageManager.getToken(),
});

createRoot(document.getElementById("root")!).render(
  <UserProvider>
    <App />
  </UserProvider>,
);
