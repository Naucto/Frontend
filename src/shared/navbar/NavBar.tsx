import { NavElem, ImportantNavElem } from "@shared/navbar/NavElem";
import NavProfil from "@shared/navbar/NavProfil";
import { SearchBar } from "@shared/navbar/SearchBar";
import { useTheme } from "@theme/ThemeContext";
import React from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";

const Nav = styled.nav`
    display: grid;
    padding: 0;
    margin: 0;
    grid-template-columns: 1fr 1fr 1fr;
    align-items: center;
    justify-content: space-between;
    .navbar-logo {
        width: 55px;
        height: 55px;
    }
`;

const Left = styled.div`
    display: flex;
    align-items: center;
    margin: ${({ theme }) => theme.spacing(1)};
    & > * {
      margin-right: ${({ theme }) => theme.spacing(3)};
    }
    `;

const Right = styled.div`
    display: flex;
    align-items: center;
    justify-content: right;
    margin: ${({ theme }) => theme.spacing(1)};
    `;

const NavBar: React.FC = () => {
  const theme = useTheme();
  return (
    <Nav className="navbar">
      <Left>
        <img className="navbar-logo" src={theme.logo.primary} alt="Logo" />
        <ImportantNavElem to="/create" theme={theme}>Create</ImportantNavElem>
        <NavElem to="/hub">Home</NavElem>
        <NavElem to="/help">Help</NavElem>
      </Left>

      <SearchBar />

      <Right>
        <NavElem to="/friends">Friends</NavElem>
        <NavProfil />
      </Right>
    </Nav >
  );
};

export default NavBar;