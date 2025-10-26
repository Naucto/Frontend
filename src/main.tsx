import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { UserProvider } from "@providers/UserProvider.tsx";

createRoot(document.getElementById("root")!).render(
  <UserProvider>
    <App />
  </UserProvider>,
);
