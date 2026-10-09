import type { AnalyticsContextDto } from '@naucto/api-client';

const UTM_MAX_LENGTH = 200;
const REFERRER_MAX_LENGTH = 2048;

export interface LandingSource {
  referrer: string;
  search: string;
}

/** Where this visit came from, read once from the page the visitor landed on. */
export function landingContext(source: LandingSource): AnalyticsContextDto {
  const params = new URLSearchParams(source.search);
  const utm = (name: string): string | undefined => {
    const value = params.get(name)?.trim();
    return value ? value.slice(0, UTM_MAX_LENGTH) : undefined;
  };
  return {
    referrer: source.referrer.slice(0, REFERRER_MAX_LENGTH) || undefined,
    utmSource: utm('utm_source'),
    utmMedium: utm('utm_medium'),
    utmCampaign: utm('utm_campaign'),
  };
}
