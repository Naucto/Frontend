import { Link } from "react-router-dom";
import styled from "styled-components";

export const NavElem = styled(Link)`
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 1rem 1rem;
    text-decoration: none;
    color: white;
    font-size: 1.2rem;
`;

export const ImportantNavElem = styled(NavElem) <{ theme: any }>`
    background-color: ${({ theme }) => theme.colors.red};
    border-radius: 8px;
    padding: 0.9rem 1.6rem;

`;
