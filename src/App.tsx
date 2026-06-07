import "./App.css";
import React, { Suspense, lazy } from "react";
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
  return (
    <ThemeProvider theme={muiTheme}>
      <CustomSnackBarProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </CustomSnackBarProvider>
    </ThemeProvider >
  );
};

export default App;
