import "./App.css";
import React, { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Hub } from "@modules/hub/Hub";
import { ThemeProvider } from "@mui/material/styles";
import NavBar from "@shared/navbar/NavBar";
import { muiTheme } from "@theme/MUITheme";
import { CustomSnackBarProvider } from "@shared/snackBar/CustomSnackBarProvider";
import Profile from "@modules/profile/Profile";
import ProfilePublishedGames from "@modules/profile/ProfilePublishedGames";
import ProfileLikedGames from "@modules/profile/ProfileLikedGames";

import { GameViewer } from "@modules/hub/components/GameViewer";
import { OAuthCallback } from "@modules/auth/OAuthCallback";
import { MicrosoftOAuthCallback } from "@modules/auth/MicrosoftOAuthCallback";
import { GoogleOAuthCallback } from "@modules/auth/GoogleOAuthCallback";
import { useAuthSuccess } from "@hooks/useAuthSuccess";
import { styled } from "@mui/material/styles";
import { SiteFooter } from "@shared/footer/SiteFooter";

const AppContainer = styled("div")(() => ({
  display: "flex",
  flexDirection: "column",
  flex: "1 0 auto",
  minHeight: "100%",
}));

const AppContent = styled("div")(() => ({
  display: "flex",
  flexDirection: "column",
  flex: "1 0 auto",
  minHeight: "auto",
}));

const Projects = lazy(() => import("@modules/projects/Projects"));
const ProjectCategoryPage = lazy(() => import("@modules/projects/ProjectCategoryPage"));
const Project = lazy(() => import("@modules/project/Project"));
const Help = lazy(() => import("@modules/help/Help"));
const HubCategoryPage = lazy(() => import("@modules/hub/HubCategoryPage"));

type RouterState = {
  backgroundLocation?: Location;
};

const AppRoutes: React.FC = () => {
  const location = useLocation();
  const state = location.state as RouterState | null;
  const backgroundLocation = state?.backgroundLocation;
  const isStandalonePlayRoute =
    !backgroundLocation && /^\/project\/\d+\/play$/.test(location.pathname);

  return (
    <AppContainer>
      <NavBar />
      <AppContent>
        <Suspense fallback={null}>
          <Routes location={backgroundLocation || location}>
            <Route path="/" element={<Hub />} />
            <Route path="/hub" element={<Hub />} />
            <Route path="/hub/category/:category" element={<HubCategoryPage />} />
            <Route path='/projects' element={<Projects />} />
            <Route path="/projects/category/:category" element={<ProjectCategoryPage />} />
            <Route path="/projects/:projectId" element={<Project />} />
            <Route path="/help" element={<Help />} />
            {isStandalonePlayRoute && (
              <Route path="/project/:id/play" element={<Hub />} />
            )}
            <Route path="/profile/:username" element={<Profile />} />
            <Route path="/profile/:username/published-games" element={<ProfilePublishedGames />} />
            <Route path="/profile/:username/liked-games" element={<ProfileLikedGames />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/oauth/google/callback" element={<GoogleOAuthCallback />} />
            <Route path="/oauth/microsoft/callback" element={<MicrosoftOAuthCallback />} />
          </Routes>
          {(backgroundLocation || isStandalonePlayRoute) && (
            <Routes>
              <Route path="/project/:id/play" element={<GameViewer />} />
            </Routes>
          )}
        </Suspense>
      </AppContent>
      <SiteFooter />
    </AppContainer>
  );
};

const App: React.FC = () => {
  const { handleAuthSuccess } = useAuthSuccess();

  useEffect(() => {
    const handleMessage = (event: MessageEvent): void => {
      if (event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== "object") return;
      if (event.data.type === "microsoft_auth_success" && event.data.token) {
        handleAuthSuccess(event.data.token).catch(err => {
          console.error("Error handling auth success:", err);
        });
      } else if (event.data.type === "microsoft_auth_error") {
        console.error("[Microsoft OAuth] Error received from popup:", event.data.error);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleAuthSuccess]);
  return (
    <ThemeProvider theme={muiTheme}>
      <CustomSnackBarProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </CustomSnackBarProvider>
    </ThemeProvider>
  );
};

export default App;
