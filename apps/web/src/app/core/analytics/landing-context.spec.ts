import { describe, expect, it } from 'vitest';

import { landingContext } from './landing-context';

describe('landingContext', () => {
  it('reads the referrer and the campaign of the landing page', () => {
    expect(
      landingContext({
        referrer: 'https://news.example/post',
        search: '?utm_source=newsletter&utm_medium=email&utm_campaign=spring&page=2',
      }),
    ).toEqual({
      referrer: 'https://news.example/post',
      utmSource: 'newsletter',
      utmMedium: 'email',
      utmCampaign: 'spring',
    });
  });

  it('leaves out what a direct visit does not have', () => {
    expect(landingContext({ referrer: '', search: '?utm_source=%20' })).toEqual({
      referrer: undefined,
      utmSource: undefined,
      utmMedium: undefined,
      utmCampaign: undefined,
    });
  });

  it('cuts values to what the server stores', () => {
    const context = landingContext({
      referrer: `https://a.example/${'x'.repeat(3000)}`,
      search: `?utm_campaign=${'c'.repeat(300)}`,
    });

    expect(context.referrer).toHaveLength(2048);
    expect(context.utmCampaign).toHaveLength(200);
  });
});
