import "./App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Hub } from "@modules/hub/Hub";
import { ThemeProvider } from "@mui/material/styles";
import NavBar from "@shared/navbar/NavBar";
import { muiTheme } from "@theme/MUITheme";
import Projects from "@modules/projects/Projects";
import Project from "@modules/project/Project";
import { CustomSnackBarProvider } from "@shared/snackBar/CustomSnackBarProvider";
import Profile from "@modules/profile/Profile";

const App: React.FC = () => {
  return (
    <ThemeProvider theme={muiTheme}>
      <CustomSnackBarProvider>
        {/* TODO: Change how the Routes works, should put all routes like that ? */}
        <BrowserRouter>
          <NavBar />
          <Routes>
            <Route path="/" element={<Hub />} />
            <Route path="/hub" element={<Hub />} />
            <Route path='/projects' element={<Projects />} />
            <Route path="/projects/:projectId" element={<Project />} />
            <Route path="/profile/:profileId" element={<Profile />} />
          </Routes>
        </BrowserRouter>
      </CustomSnackBarProvider>
    </ThemeProvider >
  );
};

export default App;
