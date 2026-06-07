import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import { Autocomplete, Box, FormControl, Paper, Select, TextField } from "@mui/material";
import { alpha, styled } from "@mui/material/styles";

export const FilterPanel = styled(Box)(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(1.5),
  padding: theme.spacing(1.5),
  borderRadius: theme.custom.rounded.md,
  backgroundColor: alpha(theme.palette.common.white, 0.06),
  backdropFilter: "blur(12px)",
  width: "100%",
}));

export const SelectFormControl = styled(FormControl)<{ minwidth?: number }>(({ minwidth }) => ({
  minWidth: minwidth ?? 180,
}));

export const DarkSelect = styled(Select)(({ theme }) => ({
  color: theme.palette.common.white,
  backgroundColor: alpha(theme.palette.gray[900], 0.72),
  borderRadius: theme.custom.rounded.md,
  ".MuiOutlinedInput-notchedOutline": {
    borderColor: alpha(theme.palette.common.white, 0.18),
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: alpha(theme.palette.common.white, 0.3),
  },
  ".MuiSvgIcon-root": {
    color: theme.palette.common.white,
  },
}));

export const DarkTextField = styled(TextField)(({ theme }) => ({
  minWidth: 220,
  ".MuiOutlinedInput-root": {
    color: theme.palette.common.white,
    backgroundColor: alpha(theme.palette.gray[900], 0.72),
  },
  ".MuiInputLabel-root": {
    color: alpha(theme.palette.common.white, 0.7),
  },
  ".MuiInputLabel-root.Mui-focused": {
    color: theme.palette.common.white,
  },
}));

export const TagsAutocomplete = styled(Autocomplete<string, true, false, false>)({
  minWidth: 280,
  flex: 1,
});

export const AutocompleteOption = styled("li")(({ theme }) => ({
  color: theme.palette.common.white,
  backgroundColor: theme.palette.gray[900],
}));

export const DarkAutocompletePaper = styled(Paper)(({ theme }) => ({
  backgroundColor: theme.palette.gray[900],
  color: theme.palette.common.white,
  backgroundImage: "none",
  ".MuiAutocomplete-listbox": {
    maxHeight: 240,
    overflowY: "auto",
  },
}));

export const DarkAutocompleteListbox = styled("ul")({
  maxHeight: 240,
  overflowY: "auto",
});

export const autocompleteSlots = {
  paper: DarkAutocompletePaper,
  listbox: DarkAutocompleteListbox,
};

export const SmallCopyIcon = styled(ContentCopyOutlinedIcon)({
  fontSize: 16,
});
