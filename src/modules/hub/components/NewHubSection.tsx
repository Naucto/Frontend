import { ProjectExResponseDto } from "@api";
import { CustomSortButton, SummaryChip } from "@modules/projects/components/browse/Controls";
import { type JSX } from "react";
import { HubDateOrder, HubReleaseWindow } from "../hubSorting";
import { NewGamesFiltersState } from "./filters/NewGamesFiltersPanel";
import { FilterPanel } from "./filters/FilterStyles";
import {
  ListSortMetricSelect,
  ListSortSummaryChip,
  OrderToggleButton,
  ReleaseWindowSelect,
  SearchField,
  SelectedTagChips,
  SelectedTagSummaryChips,
  TagsField,
} from "./filters/FilterFields";
import { HubCarouselSection } from "./HubCarouselSection";

type NewHubSectionProps = {
  availableTags: string[];
  filters: NewGamesFiltersState;
  expanded: boolean;
  visibleProjects: ProjectExResponseDto[];
  displayedCount: number;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onToggleExpanded: () => void;
  onChange: (next: Partial<NewGamesFiltersState>) => void;
  onViewMore: () => void;
  onLoadMore: () => Promise<void>;
};

export const NewHubSection = ({
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
}: NewHubSectionProps): JSX.Element => {
  const headerControls = (
    <>
      <ReleaseWindowSelect
        value={filters.releaseWindow}
        onChange={(releaseWindow: HubReleaseWindow) => onChange({ releaseWindow })}
      />
      <CustomSortButton variant="outlined" onClick={onToggleExpanded}>
        {expanded ? "Hide custom sort" : "Custom sort"}
      </CustomSortButton>
      <OrderToggleButton value={filters.order} onChange={(order: HubDateOrder) => onChange({ order })} />
      <ListSortSummaryChip metric={filters.sortMetric} />
      {filters.searchQuery ? (
        <SummaryChip label={`Name: ${filters.searchQuery}`} size="small" />
      ) : null}
      <SelectedTagSummaryChips
        keyPrefix="new"
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
      title="New games"
      scrollId="new-games"
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
