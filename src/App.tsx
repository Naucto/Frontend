import "./App.css";
import React, { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Hub } from "@modules/hub/Hub";
import { ThemeProvider } from "@mui/material/styles";
import NavBar from "@shared/navbar/NavBar";
import { muiTheme } from "@theme/MUITheme";
import { CustomSnackBarProvider } from "@shared/snackBar/CustomSnackBarProvider";
import { GameViewer } from "@modules/hub/components/GameViewer";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { OAuthCallback } from "@modules/auth/OAuthCallback";

const Projects = lazy(() => import("@modules/projects/Projects"));
const Project = lazy(() => import("@modules/project/Project"));

const App: React.FC = () => {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <ThemeProvider theme={muiTheme}>
        <CustomSnackBarProvider>
          {/* TODO: Change how the Routes works, should put all routes like that ? */}
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
              </Routes>
            </Suspense>
          </BrowserRouter>
        </CustomSnackBarProvider>
      </ThemeProvider >
    </GoogleOAuthProvider>
  );
};

export default App;

