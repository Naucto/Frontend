import "./App.css";
import React, { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Hub } from "@modules/hub/Hub";
import { ThemeProvider } from "@mui/material/styles";
import NavBar from "@shared/navbar/NavBar";
import { muiTheme } from "@theme/MUITheme";
import { CustomSnackBarProvider } from "@shared/snackBar/CustomSnackBarProvider";
import { GameViewer } from "@modules/hub/components/GameViewer";
import { OAuthCallback } from "@modules/auth/OAuthCallback";
import { MicrosoftOAuthCallback } from "@modules/auth/MicrosoftOAuthCallback";
import { GoogleOAuthCallback } from "@modules/auth/GoogleOAuthCallback";
import { useAuthSuccess } from "@hooks/useAuthSuccess";

const Projects = lazy(() => import("@modules/projects/Projects"));
const Project = lazy(() => import("@modules/project/Project"));

const App: React.FC = () => {
  const { handleAuthSuccess } = useAuthSuccess();

  useEffect(() => {
    const handleMessage = (event: MessageEvent): void => {
      if (event.origin !== window.location.origin) return;
      if (event.data.type === "microsoft_auth_success" && event.data.token) {
        handleAuthSuccess(event.data.token).catch(err => {
          console.error("Error handling auth success:", err);
        });
      } else if (event.data.type === "microsoft_auth_error") {
        console.error("[Microsoft OAuth] Erreur reçue du popup:", event.data.error);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleAuthSuccess]);
  return (
    <ThemeProvider theme={muiTheme}>
      <CustomSnackBarProvider>
        <BrowserRouter>
          <NavBar />
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<Hub />} />
              <Route path="/hub" element={<Hub />} />
              <Route path='/projects' element={<Projects />} />
              <Route path="/projects/:projectId" element={<Project />} />
              <Route path="/project/:id/play" element={<GameViewer />} />
              <Route path="/oauth/callback" element={<OAuthCallback />} />
              <Route path="/oauth/google/callback" element={<GoogleOAuthCallback />} />
              <Route path="/oauth/microsoft/callback" element={<MicrosoftOAuthCallback />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </CustomSnackBarProvider>
    </ThemeProvider>
  );
};

export default App;

