import { Box, Input, useTheme } from "@mui/material";
import styled from "styled-components";

const SearchBarContainer = styled(Box)`

    display: flex;
    align-items: center;
    justify-content: center;
    margin: 1rem 1rem;
    `;

const SearchInput = styled(Input)`
    background-color: transparent;
    color: white;
    border-radius: 4px;
    border: 3px solid ${({ theme }) => theme.colors.grey};
    padding: 0.5rem;
    margin-left: 1rem;
`;

export const SearchBar = () => {
    return (
        <SearchBarContainer>
            <form onSubmit={(e) => {
                console.log("search");
            }}>
                <SearchInput
                    type="text"
                    placeholder="Search..."
                />
            </form>
        </SearchBarContainer>
    );
}

