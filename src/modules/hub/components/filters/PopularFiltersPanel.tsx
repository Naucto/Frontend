import { type JSX } from "react";
import { HubReleaseWindow, HubSortMetric } from "../../hubSorting";
import { FilterPanel } from "./FilterStyles";
import {
  PopularSortMetricSelect,
  PopularSortSummaryChip,
  ReleaseWindowSelect,
  SearchField,
  SelectedTagChips,
  TagsField,
} from "./FilterFields";

export type PopularFiltersState = {
  sortMetric: HubSortMetric;
  releaseWindow: HubReleaseWindow;
  selectedTags: string[];
  searchQuery: string;
};

type PopularFiltersPanelProps = {
  availableTags: string[];
  filters: PopularFiltersState;
  onChange: (next: Partial<PopularFiltersState>) => void;
};

export const PopularFiltersPanel = ({
  availableTags,
  filters,
  onChange,
}: PopularFiltersPanelProps): JSX.Element => (
  <FilterPanel>
    <ReleaseWindowSelect
      value={filters.releaseWindow}
      onChange={(releaseWindow) => onChange({ releaseWindow })}
    />
    <PopularSortMetricSelect
      value={filters.sortMetric}
      onChange={(sortMetric) => onChange({ sortMetric })}
    />
    <PopularSortSummaryChip metric={filters.sortMetric} />
    <SearchField
      value={filters.searchQuery}
      onChange={(searchQuery) => onChange({ searchQuery })}
    />
    <TagsField
      availableTags={availableTags}
      value={filters.selectedTags}
      onChange={(selectedTags) => onChange({ selectedTags })}
    />
    <SelectedTagChips
      tags={filters.selectedTags}
      onRemove={(tag) => onChange({ selectedTags: filters.selectedTags.filter((current) => current !== tag) })}
    />
  </FilterPanel>
);
