import { HubDateOrder, HubListSortMetric, HubReleaseWindow } from "../../hubSorting";
import {
  ListSortMetricSelect,
  ListSortSummaryChip,
  OrderToggleButton,
  ReleaseWindowSelect,
  SearchField,
  SelectedTagChips,
  TagsField,
} from "./FilterFields";
import { FilterPanel } from "./FilterStyles";

import { type JSX } from "react";

export type NewGamesFiltersState = {
  releaseWindow: HubReleaseWindow;
  order: HubDateOrder;
  sortMetric: HubListSortMetric;
  selectedTags: string[];
  searchQuery: string;
};

type NewGamesFiltersPanelProps = {
  availableTags: string[];
  filters: NewGamesFiltersState;
  onChange: (next: Partial<NewGamesFiltersState>) => void;
};

export const NewGamesFiltersPanel = ({
  availableTags,
  filters,
  onChange,
}: NewGamesFiltersPanelProps): JSX.Element => (
  <FilterPanel>
    <ReleaseWindowSelect
      value={filters.releaseWindow}
      onChange={(releaseWindow) => onChange({ releaseWindow })}
    />
    <ListSortMetricSelect
      value={filters.sortMetric}
      onChange={(sortMetric) => onChange({ sortMetric })}
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
