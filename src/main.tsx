import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { UserProvider } from "@providers/UserProvider.tsx";
import { client } from "@api/client.gen";
import { LocalStorageManager } from "@utils/LocalStorageManager";

client.setConfig({
  baseURL: import.meta.env.VITE_BACKEND_URL ?? "",
  auth: () => LocalStorageManager.getToken(),
});

createRoot(document.getElementById("root")!).render(
  <UserProvider>
    <App />
  </UserProvider>,
);
