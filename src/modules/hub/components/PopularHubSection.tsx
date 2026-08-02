import { ProjectExResponseDto } from "@api";
import { CustomSortButton, SummaryChip } from "@modules/projects/components/browse/Controls";

import { HubReleaseWindow, HubSortMetric } from "../hubSorting";
import {
  PopularSortMetricSelect,
  PopularSortSummaryChip,
  ReleaseWindowSelect,
  SearchField,
  SelectedTagChips,
  SelectedTagSummaryChips,
  TagsField,
} from "./filters/FilterFields";
import { FilterPanel } from "./filters/FilterStyles";
import { PopularFiltersState } from "./filters/PopularFiltersPanel";
import { HubCarouselSection } from "./HubCarouselSection";

import { type JSX } from "react";

type PopularHubSectionProps = {
  availableTags: string[];
  filters: PopularFiltersState;
  expanded: boolean;
  visibleProjects: ProjectExResponseDto[];
  displayedCount: number;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onToggleExpanded: () => void;
  onChange: (next: Partial<PopularFiltersState>) => void;
  onViewMore: () => void;
  onLoadMore: () => Promise<void>;
};

export const PopularHubSection = ({
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
}: PopularHubSectionProps): JSX.Element => {
  const headerControls = (
    <>
      <ReleaseWindowSelect
        value={filters.releaseWindow}
        onChange={(releaseWindow: HubReleaseWindow) => onChange({ releaseWindow })}
      />
      <CustomSortButton variant="outlined" onClick={onToggleExpanded}>
        {expanded ? "Hide custom sort" : "Custom sort"}
      </CustomSortButton>
      <PopularSortSummaryChip metric={filters.sortMetric} />
      {filters.searchQuery ? (
        <SummaryChip label={`Name: ${filters.searchQuery}`} size="small" />
      ) : null}
      <SelectedTagSummaryChips
        keyPrefix="popular"
        tags={filters.selectedTags}
        onRemove={(tag) => onChange({
          selectedTags: filters.selectedTags.filter((current) => current !== tag),
        })}
      />
    </>
  );

  const expandedContent = expanded ? (
    <FilterPanel>
      <PopularSortMetricSelect
        value={filters.sortMetric}
        onChange={(sortMetric: HubSortMetric) => onChange({ sortMetric })}
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
      title="Popular games"
      scrollId="popular-games"
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
