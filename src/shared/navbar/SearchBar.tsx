import { Box, InputBase, useTheme } from "@mui/material";
import styled from "styled-components";
import SearchIcon from "@assets/search.svg";


const SearchBarContainer = styled(Box)`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    `;

const SearchInput = styled(InputBase)`
    && {
      font-family: 'Pixelify';
      color: white;
      border: 2px solid #646464;
      border-radius: 4px;
      padding: 0.5rem 1rem;
  
      input {
        color: white;
      }
      
    }
  `;

const SearchIconStyled = styled(SearchIcon)`
    width: 20px;
    height: 20px;
    margin-right: ${({ theme }) => theme.spacing(1)};
  `;

export const SearchBar = () => {
  return (
    <SearchBarContainer>
      <form onSubmit={(e) => {
        console.log("search");
      }}>
        <SearchInput
          type="text"
          placeholder="Search for games..."
          startAdornment={<SearchIconStyled />}
        />
      </form>
    </SearchBarContainer>
  );
}

