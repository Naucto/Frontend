import "./App.css";
import React, { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Hub } from "@modules/hub/Hub";
import { ThemeProvider } from "@mui/material/styles";
import NavBar from "@shared/navbar/NavBar";
import { muiTheme } from "@theme/MUITheme";
import { CustomSnackBarProvider } from "@shared/snackBar/CustomSnackBarProvider";
import { GameViewer } from "@modules/hub/components/GameViewer";

const Projects = lazy(() => import("@modules/projects/Projects"));
const Project = lazy(() => import("@modules/project/Project"));

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
    <>
      <NavBar />
      <Suspense fallback={null}>
        <Routes location={backgroundLocation || location}>
          <Route path="/" element={<Hub />} />
          <Route path="/hub" element={<Hub />} />
          <Route path='/projects' element={<Projects />} />
          <Route path="/projects/:projectId" element={<Project />} />
          {isStandalonePlayRoute && (
            <Route path="/project/:id/play" element={<Hub />} />
          )}
        </Routes>
        {(backgroundLocation || isStandalonePlayRoute) && (
          <Routes>
            <Route path="/project/:id/play" element={<GameViewer />} />
          </Routes>
        )}
      </Suspense>
    </>
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

