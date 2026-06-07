import {
  getProjectSortMetricLabel,
  getProjectSortOrderLabel,
  type ProjectSortMetric,
  type ProjectSortOrder,
} from "@modules/projects/projectListUtils";
import { darkMenuProps } from "@shared/darkMenuProps";

import { CustomSortButton, SummaryChip } from "./Controls";

import { type JSX } from "react";

import { Autocomplete, Chip, FormControl, MenuItem, Paper, Select, TextField } from "@mui/material";
import { alpha, styled } from "@mui/material/styles";

type ProjectSortFiltersProps = {
  availableTags: string[];
  projectNameQuery: string;
  selectedTags: string[];
  sortMetric: ProjectSortMetric;
  sortOrder: ProjectSortOrder;
  onProjectNameQueryChange: (value: string) => void;
  onSelectedTagsChange: (value: string[]) => void;
  onSortMetricChange: (value: ProjectSortMetric) => void;
  onSortOrderToggle: () => void;
  showAppliedChips?: boolean;
  showSortSummary?: boolean;
};

const FilterPanel = styled("div")(({ theme }) => ({
  display: "flex",
  flexWrap: "wrap",
  gap: theme.spacing(1.5),
  padding: theme.spacing(1.5),
  borderRadius: theme.custom.rounded.md,
  backgroundColor: alpha(theme.palette.common.white, 0.06),
  backdropFilter: "blur(12px)",
  marginTop: theme.spacing(2),
  width: "100%",
}));

const SelectFormControl = styled(FormControl)<{ minwidth?: number }>(({ minwidth }) => ({
  minWidth: minwidth ?? 180,
}));

const DarkSelect = styled(Select)(({ theme }) => ({
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

const DarkTextField = styled(TextField)(({ theme }) => ({
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

const TagsAutocomplete = styled(Autocomplete<string, true, false, false>)({
  minWidth: 280,
  flex: 1,
});

const AutocompleteOption = styled("li")(({ theme }) => ({
  color: theme.palette.common.white,
  backgroundColor: theme.palette.gray[900],
}));

const DarkAutocompletePaper = styled(Paper)(({ theme }) => ({
  backgroundColor: theme.palette.gray[900],
  color: theme.palette.common.white,
  backgroundImage: "none",
  ".MuiAutocomplete-listbox": {
    maxHeight: 240,
    overflowY: "auto",
  },
}));

const DarkAutocompleteListbox = styled("ul")({
  maxHeight: 240,
  overflowY: "auto",
});

const autocompleteSlots = {
  paper: DarkAutocompletePaper,
  listbox: DarkAutocompleteListbox,
};

export const ProjectSortFilters = ({
  availableTags,
  projectNameQuery,
  selectedTags,
  sortMetric,
  sortOrder,
  onProjectNameQueryChange,
  onSelectedTagsChange,
  onSortMetricChange,
  onSortOrderToggle,
  showAppliedChips = false,
  showSortSummary = false,
}: ProjectSortFiltersProps): JSX.Element => (
  <FilterPanel>
    <SelectFormControl size="small">
      <DarkSelect
        value={sortMetric}
        onChange={(event) => onSortMetricChange(event.target.value as ProjectSortMetric)}
        MenuProps={darkMenuProps}
      >
        <MenuItem value="updatedAt">Last updated</MenuItem>
        <MenuItem value="createdAt">Created date</MenuItem>
        <MenuItem value="publishedAt">Published date</MenuItem>
        <MenuItem value="name">Name</MenuItem>
        <MenuItem value="tags">Tags</MenuItem>
      </DarkSelect>
    </SelectFormControl>
    <CustomSortButton variant="outlined" onClick={onSortOrderToggle}>
      {getProjectSortOrderLabel(sortOrder)}
    </CustomSortButton>
    {showSortSummary ? <SummaryChip label={`Sort: ${getProjectSortMetricLabel(sortMetric)}`} size="small" /> : null}
    <DarkTextField
      value={projectNameQuery}
      onChange={(event) => onProjectNameQueryChange(event.target.value)}
      label="Search by name"
      placeholder="Project name..."
    />
    <TagsAutocomplete
      multiple
      options={availableTags}
      value={selectedTags}
      onChange={(_, value) => onSelectedTagsChange(value)}
      slots={autocompleteSlots}
      renderOption={(props, option) => (
        <AutocompleteOption {...props}>
          {option}
        </AutocompleteOption>
      )}
      renderInput={(params) => (
        <DarkTextField
          {...params}
          label="Filter by tags"
          placeholder="Action, RPG..."
        />
      )}
    />
    {showAppliedChips ? selectedTags.map((tag) => (
      <Chip
        key={tag}
        label={tag}
        size="small"
        onDelete={() => onSelectedTagsChange(selectedTags.filter((currentTag) => currentTag !== tag))}
      />
    )) : null}
    {showAppliedChips && projectNameQuery ? (
      <Chip
        label={`Name: ${projectNameQuery}`}
        size="small"
        onDelete={() => onProjectNameQueryChange("")}
      />
    ) : null}
  </FilterPanel>
);
