import { describe, expect, it } from 'vitest';

import { SaveTracker } from './save-tracker';

describe('SaveTracker', () => {
  it('reports a save as settled when nothing changed while it was out', () => {
    const tracker = new SaveTracker();
    const mark = tracker.mark();
    expect(tracker.settled(mark)).toBe(true);
  });

  it('does not report a save as settled when the document moved after it encoded', () => {
    // The case that lost work: a change accepted from the assistant lands between the encode and
    // the response. It is not in the uploaded bytes, and since an applied change reaches storage
    // only through the dirty flag this raises, clearing the flag loses it.
    const tracker = new SaveTracker();
    const mark = tracker.mark();
    tracker.changed();
    expect(tracker.settled(mark)).toBe(false);
  });

  it('settles only against the newest change, not an older one', () => {
    const tracker = new SaveTracker();
    const first = tracker.mark();
    tracker.changed();
    const second = tracker.mark();
    expect(tracker.settled(first)).toBe(false);
    expect(tracker.settled(second)).toBe(true);
    tracker.changed();
    expect(tracker.settled(second)).toBe(false);
  });
});
