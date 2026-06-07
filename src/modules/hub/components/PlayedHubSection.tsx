import { ProjectExResponseDto } from "@api";
import { CustomSortButton, SummaryChip } from "@modules/projects/components/browse/Controls";
import { type JSX } from "react";
import { HubDateOrder } from "../hubSorting";
import { PlayedGamesFiltersState } from "./filters/PlayedGamesFiltersPanel";
import { FilterPanel } from "./filters/FilterStyles";
import {
  ListSortMetricSelect,
  ListSortSummaryChip,
  OrderToggleButton,
  SearchField,
  SelectedTagChips,
  SelectedTagSummaryChips,
  TagsField,
} from "./filters/FilterFields";
import { HubCarouselSection } from "./HubCarouselSection";

type PlayedHubSectionProps = {
  availableTags: string[];
  filters: PlayedGamesFiltersState;
  expanded: boolean;
  visibleProjects: ProjectExResponseDto[];
  displayedCount: number;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onToggleExpanded: () => void;
  onChange: (next: Partial<PlayedGamesFiltersState>) => void;
  onViewMore: () => void;
  onLoadMore: () => Promise<void>;
};

export const PlayedHubSection = ({
  availableTags,
  filters,
  expanded,
  visibleProjects,
  displayedCount,
  canLoadMore,
  isLoadingMore,
  onToggleExpanded,
  onChange,
  onViewMore,
  onLoadMore,
}: PlayedHubSectionProps): JSX.Element => {
  const headerControls = (
    <>
      <CustomSortButton variant="outlined" onClick={onToggleExpanded}>
        {expanded ? "Hide custom sort" : "Custom sort"}
      </CustomSortButton>
      <OrderToggleButton value={filters.order} onChange={(order: HubDateOrder) => onChange({ order })} />
      <ListSortSummaryChip metric={filters.sortMetric} />
      {filters.searchQuery ? (
        <SummaryChip label={`Name: ${filters.searchQuery}`} size="small" />
      ) : null}
      <SelectedTagSummaryChips
        keyPrefix="played"
        tags={filters.selectedTags}
        onRemove={(tag) => onChange({
          selectedTags: filters.selectedTags.filter((current) => current !== tag),
        })}
      />
    </>
  );

  const expandedContent = expanded ? (
    <FilterPanel>
      <ListSortMetricSelect
        value={filters.sortMetric}
        onChange={(sortMetric) => onChange({ sortMetric })}
        includeLastPlayed
      />
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
        onRemove={(tag) => onChange({
          selectedTags: filters.selectedTags.filter((current) => current !== tag),
        })}
      />
    </FilterPanel>
  ) : undefined;

  return (
    <HubCarouselSection
      title="Played games"
      scrollId="played-games"
      displayedCount={displayedCount}
      visibleProjects={visibleProjects}
      canLoadMore={canLoadMore}
      isLoadingMore={isLoadingMore}
      headerControls={headerControls}
      expandedContent={expandedContent}
      onViewMore={onViewMore}
      onLoadMore={onLoadMore}
    />
  );
};
