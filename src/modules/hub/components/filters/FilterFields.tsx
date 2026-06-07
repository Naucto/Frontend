import { Box, Chip, MenuItem } from "@mui/material";
import { darkMenuProps } from "@shared/darkMenuProps";
import { type JSX } from "react";
import { CustomSortButton, SummaryChip } from "@modules/projects/components/browse/Controls";
import {
  HubDateOrder,
  HubListSortMetric,
  HubReleaseWindow,
  HubSortMetric,
  getDateOrderLabel,
  getListSortMetricLabel,
  getSortMetricLabel,
} from "@modules/hub/hubSorting";
import {
  AutocompleteOption,
  DarkSelect,
  DarkTextField,
  SelectFormControl,
  SmallCopyIcon,
  TagsAutocomplete,
  autocompleteSlots,
} from "./FilterStyles";

type SimpleChange<T> = (value: T) => void;

type ReleaseWindowSelectProps = {
  value: HubReleaseWindow;
  onChange: SimpleChange<HubReleaseWindow>;
};

export const ReleaseWindowSelect = ({ value, onChange }: ReleaseWindowSelectProps): JSX.Element => (
  <SelectFormControl size="small" minwidth={140}>
    <DarkSelect
      value={value}
      onChange={(event) => onChange(event.target.value as HubReleaseWindow)}
      MenuProps={darkMenuProps}
    >
      <MenuItem value="all">All time</MenuItem>
      <MenuItem value="365d">1 year</MenuItem>
      <MenuItem value="30d">1 month</MenuItem>
      <MenuItem value="7d">1 week</MenuItem>
    </DarkSelect>
  </SelectFormControl>
);

type PopularSortMetricSelectProps = {
  value: HubSortMetric;
  onChange: SimpleChange<HubSortMetric>;
};

export const PopularSortMetricSelect = ({ value, onChange }: PopularSortMetricSelectProps): JSX.Element => (
  <SelectFormControl size="small">
    <DarkSelect
      value={value}
      onChange={(event) => onChange(event.target.value as HubSortMetric)}
      MenuProps={darkMenuProps}
    >
      <MenuItem value="viewCount">Views</MenuItem>
      <MenuItem value="likes">Likes</MenuItem>
      <MenuItem value="commentCount">Comments</MenuItem>
      <MenuItem value="forkCount">
        <Box display="flex" alignItems="center" gap={1}>
          <SmallCopyIcon />
          <span>Forks</span>
        </Box>
      </MenuItem>
    </DarkSelect>
  </SelectFormControl>
);

type ListSortMetricSelectProps = {
  value: HubListSortMetric;
  onChange: SimpleChange<HubListSortMetric>;
  includeLastPlayed?: boolean;
};

export const ListSortMetricSelect = ({
  value,
  onChange,
  includeLastPlayed = false,
}: ListSortMetricSelectProps): JSX.Element => (
  <SelectFormControl size="small">
    <DarkSelect
      value={value}
      onChange={(event) => onChange(event.target.value as HubListSortMetric)}
      MenuProps={darkMenuProps}
    >
      {includeLastPlayed ? <MenuItem value="lastPlayed">Last played</MenuItem> : null}
      <MenuItem value="publishedAt">Published date</MenuItem>
      <MenuItem value="viewCount">Views</MenuItem>
      <MenuItem value="likes">Likes</MenuItem>
      <MenuItem value="commentCount">Comments</MenuItem>
      <MenuItem value="forkCount">Forks</MenuItem>
      <MenuItem value="name">Name</MenuItem>
      <MenuItem value="tags">Tags</MenuItem>
    </DarkSelect>
  </SelectFormControl>
);

type OrderToggleButtonProps = {
  value: HubDateOrder;
  onChange: SimpleChange<HubDateOrder>;
};

export const OrderToggleButton = ({ value, onChange }: OrderToggleButtonProps): JSX.Element => (
  <CustomSortButton variant="outlined" onClick={() => onChange(value === "desc" ? "asc" : "desc")}>
    {getDateOrderLabel(value)}
  </CustomSortButton>
);

type SearchFieldProps = {
  value: string;
  onChange: SimpleChange<string>;
};

export const SearchField = ({ value, onChange }: SearchFieldProps): JSX.Element => (
  <DarkTextField
    value={value}
    onChange={(event) => onChange(event.target.value)}
    label="Search by name"
    placeholder="Game name..."
  />
);

type TagsFieldProps = {
  availableTags: string[];
  value: string[];
  onChange: SimpleChange<string[]>;
};

export const TagsField = ({ availableTags, value, onChange }: TagsFieldProps): JSX.Element => (
  <TagsAutocomplete
    multiple
    options={availableTags}
    value={value}
    onChange={(_, next) => onChange(next)}
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
);

type SelectedTagChipsProps = {
  tags: string[];
  onRemove: SimpleChange<string>;
};

export const SelectedTagChips = ({ tags, onRemove }: SelectedTagChipsProps): JSX.Element => (
  <>
    {tags.map((tag) => (
      <Chip key={tag} label={tag} size="small" onDelete={() => onRemove(tag)} />
    ))}
  </>
);

type SelectedTagSummaryChipsProps = {
  keyPrefix: string;
  tags: string[];
  onRemove: SimpleChange<string>;
};

export const SelectedTagSummaryChips = ({ keyPrefix, tags, onRemove }: SelectedTagSummaryChipsProps): JSX.Element => (
  <>
    {tags.map((tag) => (
      <SummaryChip
        key={`${keyPrefix}-${tag}`}
        label={tag}
        size="small"
        onDelete={() => onRemove(tag)}
      />
    ))}
  </>
);

type PopularSortSummaryChipProps = {
  metric: HubSortMetric;
};

export const PopularSortSummaryChip = ({ metric }: PopularSortSummaryChipProps): JSX.Element => (
  <SummaryChip label={`Sort: ${getSortMetricLabel(metric)}`} size="small" />
);

type ListSortSummaryChipProps = {
  metric: HubListSortMetric;
};

export const ListSortSummaryChip = ({ metric }: ListSortSummaryChipProps): JSX.Element => (
  <SummaryChip label={`Sort: ${getListSortMetricLabel(metric)}`} size="small" />
);
