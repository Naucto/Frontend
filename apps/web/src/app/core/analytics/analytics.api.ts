import { Injectable } from '@angular/core';
import { analyticsIngestControllerLink, type AnalyticsLinkResponseDto } from '@naucto/api-client';

export type LinkStatus = AnalyticsLinkResponseDto['status'];

/** The one authenticated analytics call: linking this browser's visitor to the signed-in account. */
@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  async link(visitorId: string): Promise<LinkStatus | null> {
    try {
      const response = await analyticsIngestControllerLink({ body: { visitorId } });
      return response.data?.status ?? null;
    } catch {
      return null;
    }
  }
}
