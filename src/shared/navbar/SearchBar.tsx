import { Box, InputBase, useTheme } from "@mui/material";
import styled from "styled-components";
import SearchIcon from "@assets/search.svg?react";
import { ChangeEvent, FormEvent, useState } from "react";


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
      border: 2px solid ${({ theme }) => theme.colors.grey};
      border-radius: ${({ theme }) => theme.rounded.lg};
      padding: 0.5rem 1rem;
  
      input {
        color: white;
      }
      
    }
  `;

const SearchIconStyled = styled(SearchIcon)`
    width: 32px;
    height: 32px;
    color: ${({ theme }) => theme.colors.grey};
    margin-right: ${({ theme }) => theme.spacing(3)};
  `;


interface SearchBarProps {
  onSubmit: (value: string) => void;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export const SearchBar = ({ onSubmit, onChange, placeholder }: SearchBarProps) => {
  const [value, setValue] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(value);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange?.(newValue);
  };

  return (
    <SearchBarContainer>
      <form onSubmit={handleSubmit}>
        <SearchInput
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          startAdornment={<SearchIconStyled />}
        />
      </form>
    </SearchBarContainer>
  );
}

