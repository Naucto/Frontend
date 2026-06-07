import { HubDateOrder, HubListSortMetric } from "../../hubSorting";
import {
  ListSortMetricSelect,
  ListSortSummaryChip,
  OrderToggleButton,
  SearchField,
  SelectedTagChips,
  TagsField,
} from "./FilterFields";
import { FilterPanel } from "./FilterStyles";

import { type JSX } from "react";

export type PlayedGamesFiltersState = {
  order: HubDateOrder;
  sortMetric: HubListSortMetric;
  selectedTags: string[];
  searchQuery: string;
};

type PlayedGamesFiltersPanelProps = {
  availableTags: string[];
  filters: PlayedGamesFiltersState;
  onChange: (next: Partial<PlayedGamesFiltersState>) => void;
};

export const PlayedGamesFiltersPanel = ({
  availableTags,
  filters,
  onChange,
}: PlayedGamesFiltersPanelProps): JSX.Element => (
  <FilterPanel>
    <ListSortMetricSelect
      value={filters.sortMetric}
      onChange={(sortMetric) => onChange({ sortMetric })}
      includeLastPlayed
    />
    <OrderToggleButton value={filters.order} onChange={(order) => onChange({ order })} />
    <ListSortSummaryChip metric={filters.sortMetric} />
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
