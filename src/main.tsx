import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { UserProvider } from "@providers/UserProvider.tsx";
import { client } from "@api/client.gen";
import { LocalStorageManager } from "@utils/LocalStorageManager";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from "./authConfig";

const msalInstance = new PublicClientApplication(msalConfig);

client.setConfig({
  baseUrl: import.meta.env.VITE_BACKEND_URL ?? "",
  auth: () => LocalStorageManager.getToken(),
});

msalInstance.initialize().then(() => {
  createRoot(document.getElementById("root")!).render(
    <MsalProvider instance={msalInstance}>
      <UserProvider>
        <App />
      </UserProvider>
    </MsalProvider>
  );
});
