import { useCreateProject } from "@modules/projects/hooks/useCreateProject";
import { useUser } from "@providers/UserProvider";
import { FeedbackLanguagePicker } from "@shared/feedback/FeedbackLanguagePicker";
import { GameSearchOverlay } from "@shared/navbar/GameSearchOverlay";
import { Login } from "@shared/navbar/login/Login";
import NavProfile from "@shared/navbar/nav-profile/NavProfile";
import { ImportantNavActionButton, NavActionButton, NavElem } from "@shared/navbar/NavElem";
import { SearchBar } from "@shared/navbar/SearchBar";
import * as Urls from "@shared/navigation/routes";
import { muiTheme } from "@theme/MUITheme";

import React, { useState } from "react";

import AddIcon from "@mui/icons-material/Add";
import FeedbackIcon from "@mui/icons-material/Feedback";
import { styled } from "@mui/material/styles";
import { NotificationBox } from "@shared/navbar/notifications/NotificationBox";

const Nav = styled("nav")(({ theme }) => ({
  display: "grid",
  padding: 0,
  margin: theme.spacing(1, 2),
  gridTemplateColumns: "minmax(0, 1.2fr) minmax(260px, 0.8fr) minmax(0, 1.2fr)",
  alignItems: "center",
  justifyContent: "space-between",
  gap: theme.spacing(2),
  "& .navbar-logo": {
    width: 55,
    height: 55,
  },
  [theme.breakpoints.down("md")]: {
    gridTemplateColumns: "1fr",
  },
}));

const Left = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: theme.spacing(0.5),
  margin: theme.spacing(1),
}));

const Right = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "right",
  flexWrap: "wrap",
  margin: theme.spacing(1),
  gap: theme.spacing(1),
  [theme.breakpoints.down("md")]: {
    justifyContent: "flex-start",
  },
}));

const NavBar: React.FC = () => {
  const { user } = useUser();
  const [forceShowAuthOverlay, setForceShowAuthOverlay] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const { createProject, isCreatingProject } = useCreateProject();

  const openAuthOverlay = (): void => {
    setForceShowAuthOverlay(true);
  };

  const createNewGame = (): void => {
    if (!user) {
      openAuthOverlay();
      return;
    }

    void createProject();
  };

  return (
    <Nav className="navbar">
      <Left>
        <img className="navbar-logo" src={muiTheme.custom.logo.primary} alt="Logo" />
        <ImportantNavActionButton
          type="button"
          onClick={createNewGame}
          disabled={isCreatingProject}
          data-cy="nav-create-game"
        >
          <AddIcon fontSize="small" />
          {isCreatingProject ? "Creating..." : "New Game"}
        </ImportantNavActionButton>
        <NavElem to={Urls.toHub()}>Home</NavElem>
        <NavElem to={user ? "/projects" : "#"} data-cy="nav-projects" onClick={user ? undefined : openAuthOverlay}>
          My Games
        </NavElem>
        <NavElem to="/help">Help</NavElem>
      </Left>

      <SearchBar
        placeholder="Search for games..."
        value={searchValue}
        onChange={setSearchValue}
        onSubmit={setSearchValue}
        overlay={<GameSearchOverlay query={searchValue} onClose={() => setSearchValue("")} />}
      />

      <Right>
        <FeedbackLanguagePicker>
          {(openFeedbackDialog) => (
            <NavActionButton type="button" onClick={openFeedbackDialog}>
              <FeedbackIcon fontSize="small" />
              Feedback
            </NavActionButton>
          )}
        </FeedbackLanguagePicker>
        <NavElem to="/friends">Friends</NavElem>
        <NotificationBox />
        {user ? <NavProfile /> : <Login forceShowAuthOverlay={forceShowAuthOverlay} setForceShowAuthOverlay={setForceShowAuthOverlay} />}
      </Right>
    </Nav >
  );
};

export default NavBar;
