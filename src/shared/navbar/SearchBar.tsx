import { Box, InputBase } from "@mui/material";
import { styled } from "@mui/material/styles";
import SearchIcon from "@assets/search.svg?react";
import { ChangeEvent, FormEvent, useState } from "react";

const SearchBarContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
}));

const SearchInput = styled(InputBase)(({ theme }) => ({
  fontFamily: "Pixelify",
  color: "white",
  border: `2px solid ${theme.palette.gray[500]}`,
  borderRadius: theme.custom.rounded.lg,
  padding: "0.5rem 1rem",

  "& input": {
    color: "white",
  },
}));

const SearchIconStyled = styled(SearchIcon)(({ theme }) => ({
  width: 32,
  height: 32,
  color: theme.palette.gray[500],
  marginRight: theme.spacing(3),
}));
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
};

