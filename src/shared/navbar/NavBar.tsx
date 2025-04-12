import { useTheme } from "@theme/ThemeContext";
import React from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";

const Nav = styled.nav<{ theme: any }>`
    padding: 0;
    display: flex;
    align-items: center;
    padding: 1rem;
    background-color: ${({ theme }) => theme.colors.background};
    color: white;
    .navbar-logo {
        width: 55px;
        height: 55px;
        margin-right: 1rem;
    }
`;

const NavElem = styled(Link)`
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 1rem 1rem;
    text-decoration: none;
    color: white;
    font-size: 1.2rem;
`;

const NavBar: React.FC = () => {
  const theme = useTheme();

  return (
    <Nav className="navbar" theme={theme}>
      <img className="navbar-logo" src={theme.logo.primary} alt="Logo" />
      <NavElem to="/hub">Create</NavElem>
      <NavElem to="/about">Home</NavElem>
      <NavElem to="/contact">Help</NavElem>
    </Nav >
  );
};

export default NavBar;