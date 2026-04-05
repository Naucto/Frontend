import { Box, InputBase } from "@mui/material";
import { styled } from "@mui/material/styles";
import SearchIcon from "@assets/search.svg?react";
import { ChangeEvent, FormEvent, JSX, KeyboardEvent, ReactNode, useEffect, useState } from "react";

const SearchBarContainer = styled(Box)(({ theme }) => ({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  maxWidth: "720px",
  margin: "0 auto",
  [theme.breakpoints.down("lg")]: {
    maxWidth: "640px",
  },
  [theme.breakpoints.down("md")]: {
    maxWidth: "100%",
  },
}));

const SearchForm = styled("form")(() => ({
  width: "100%",
}));

const SearchInput = styled(InputBase)(({ theme }) => ({
  color: "white",
  border: `2px solid ${theme.palette.gray[400]}`,
  borderRadius: theme.custom.rounded.lg,
  padding: "0.5rem 1rem",
  width: "100%",
  backgroundColor: "rgba(0, 0, 0, 0.22)",

  "& input": {
    color: "white",
  },
}));

const SearchIconStyled = styled(SearchIcon)(({ theme }) => ({
  width: 32,
  height: 32,
  color: theme.palette.gray[400],
  marginRight: theme.spacing(3),
}));
interface SearchBarProps {
  onSubmit: (value: string) => void;
  onChange?: (value: string) => void;
  placeholder?: string;
  value?: string;
  overlay?: ReactNode;
}

export const SearchBar = ({ onSubmit, onChange, placeholder, value: controlledValue, overlay }: SearchBarProps): JSX.Element => {
  const [value, setValue] = useState(controlledValue ?? "");

  useEffect(() => {
    setValue(controlledValue ?? "");
  }, [controlledValue]);

  const handleSubmit = (e: FormEvent): void => {
    e.preventDefault();
    onSubmit(value);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange?.(newValue);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== "Escape") {
      return;
    }

    setValue("");
    onChange?.("");
    onSubmit("");
    e.currentTarget.blur();
  };

  return (
    <SearchBarContainer>
      <SearchForm onSubmit={handleSubmit}>
        <SearchInput
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          startAdornment={<SearchIconStyled />}
        />
      </SearchForm>
      {overlay}
    </SearchBarContainer>
  );
};

