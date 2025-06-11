import { styled } from "@mui/material/styles";
import { NavElem, ImportantNavElem } from "@shared/navbar/NavElem";
import NavProfile from "@shared/navbar/NavProfile";
import { SearchBar } from "@shared/navbar/SearchBar";
import React from "react";
import { useUser } from "src/providers/UserProvider";
import { muiTheme } from "@theme/MUITheme";

const Nav = styled("nav")(({ theme }) => ({
  display: "grid",
  padding: 0,
  margin: 0,
  gridTemplateColumns: "1fr 1fr 1fr",
  alignItems: "center",
  justifyContent: "space-between",
  "& .navbar-logo": {
    width: 55,
    height: 55,
  },
}));

const Left = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  margin: theme.spacing(1),
  "& > *": {
    marginRight: theme.spacing(3),
  },
}));

const Right = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "right",
  margin: theme.spacing(1),
}));

const NavBar: React.FC = () => {
  const { user } = useUser();
  return (
    <Nav className="navbar">
      <Left>
        <img className="navbar-logo" src={muiTheme.custom.logo.primary} alt="Logo" />
        <ImportantNavElem to="/create">Create</ImportantNavElem>
        <NavElem to="/hub">Home</NavElem>
        <NavElem to="/help">Help</NavElem>
      </Left>

      <SearchBar placeholder="Search for games..." onSubmit={(value) => console.log(value)} />

      <Right>
        <NavElem to="/friends">Friends</NavElem>
        {user && "logged in"}
        {<NavProfile />}
      </Right>
    </Nav >
  );
};

export default NavBar;
