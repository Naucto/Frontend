import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { MapStore } from '../map/map.store';
import { ArtStore } from './art.store';

describe('setSheetSize', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('keeps the region object when the sheet size is unchanged', () => {
    const art = TestBed.configureTestingModule({ providers: [ArtStore] }).inject(ArtStore);
    const region = art.region();
    art.setSheetSize(art.cols(), art.rows());
    expect(art.region()).toBe(region);
  });

  it('keeps the brush object when the sheet size is unchanged', () => {
    const map = TestBed.configureTestingModule({ providers: [MapStore] }).inject(MapStore);
    const brush = map.brush();
    map.setSheetSize(map.cols(), map.rows());
    expect(map.brush()).toBe(brush);
  });
});
