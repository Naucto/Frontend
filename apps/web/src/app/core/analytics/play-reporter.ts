import { effect, inject, Injectable, untracked } from '@angular/core';
import type {
  AnalyticsPlayDto,
  AnalyticsPlayReportDto,
  AnalyticsPlayResponseDto,
} from '@naucto/api-client';

import { AuthStore } from '../auth/auth.store';
import { FeaturesService } from '../config/features.service';
import { AnalyticsModeService } from './analytics-mode.service';
import { AnalyticsTransport, applyRotation, TransientTransportError } from './analytics-transport';
import type { PlayClock, PlayEndReason } from './play-tracker';
import { randomId } from './random-id';
import type { AnalyticsIdentity } from './visitor';
import { ensureVisitorId, touchSession } from './visitor';

/** The server caps the running time one anonymous ping may add. */
export const MAX_PING_PLAY_MS = 65_000;
export const PLAY_RETRY_DELAYS_MS = [2_000, 10_000, 30_000] as const;

/**
 * A stretch of one play reported under one browser identity. Its running time is cumulative from
 * `base`, so the server can take each value once whatever order they arrive in.
 */
interface ConsentedSegment {
  kind: 'consented';
  identity: AnalyticsIdentity;
  playId: string;
  continued: boolean;
  base: number;
  openedAt: number;
  /** The highest running time sent, answered or not. */
  dispatched: number;
  closed: boolean;
}

/** A stretch reported without identifiers: running time sent as deltas, each sent once. */
interface AnonymousSegment {
  kind: 'anonymous';
  watermark: number;
}

interface Play {
  releaseId: number;
  clock: PlayClock;
  /** Whether the server already counted this play, so every later stretch is a continuation. */
  counted: boolean;
  /** The server refuses this game, so its plays are not worth reporting under the visitor. */
  refused: boolean;
  segment: ConsentedSegment | AnonymousSegment | null;
}

const sameIdentity = (a: AnalyticsIdentity, b: AnalyticsIdentity): boolean =>
  a.visitorId === b.visitorId && a.sessionId === b.sessionId;

/**
 * Reports the play running in this tab. The play itself goes on whatever happens to consent or to
 * the browser's identity; each change closes the stretch reported so far and opens the next one,
 * handing over what was played in between so no interval is counted twice.
 */
@Injectable({ providedIn: 'root' })
export class PlayReporter {
  private readonly transport = inject(AnalyticsTransport);
  private readonly auth = inject(AuthStore);
  private readonly features = inject(FeaturesService);
  private readonly mode = inject(AnalyticsModeService).mode;
  private play: Play | null = null;

  constructor() {
    effect(() => {
      this.mode();
      untracked(() => {
        this.sync();
      });
    });
  }

  begin(releaseId: number, clock: PlayClock): void {
    this.end('stopped');
    this.play = { releaseId, clock, counted: false, refused: false, segment: null };
    this.sync();
  }

  end(reason: PlayEndReason, keepalive = false): void {
    const play = this.play;
    if (play) {
      this.closeSegment(play, reason, keepalive);
      this.play = null;
    }
  }

  /**
   * The page is going away, or into the back-forward cache: report what was played while the
   * browser still sends. A page that comes back reopens the play as a continuation.
   */
  exit(): void {
    const play = this.play;
    if (play) {
      this.closeSegment(play, 'pagehide', true);
    }
  }

  /** Counts a view of the game, under the visitor when the browser agreed to it. */
  registerView(releaseId: number): void {
    const body =
      untracked(() => this.mode()) === 'consented' ? { visitorId: ensureVisitorId() } : {};
    void this.transport
      .post(`/projects/releases/${String(releaseId)}/view`, body)
      .catch(() => undefined);
  }

  /** Brings the current stretch in line with the reporting mode and the browser's identity. */
  sync(): void {
    const play = this.play;
    if (!play) {
      return;
    }
    const mode = untracked(() => this.mode());
    const segment = play.segment;
    if (segment?.kind === 'consented') {
      if (mode === 'consented') {
        const identity = this.identity();
        if (!segment.closed && sameIdentity(segment.identity, identity)) {
          return;
        }
        this.endConsented(play, segment, 'rotated', false);
        play.segment = null;
        if (!play.refused) {
          this.openConsented(play, identity);
        }
        return;
      }
      const remainder = play.clock.activeMs - (segment.base + segment.dispatched);
      segment.closed = true;
      play.segment = null;
      if (mode === 'anonymous') {
        this.ping(play, 'FLUSH', remainder, false);
        play.segment = { kind: 'anonymous', watermark: play.clock.activeMs };
      }
      return;
    }
    if (segment?.kind === 'anonymous') {
      if (mode === 'anonymous') {
        return;
      }
      this.ping(play, 'FLUSH', play.clock.activeMs - segment.watermark, false);
      play.segment = null;
    }
    if (mode === 'consented' && !play.refused) {
      this.openConsented(play, this.identity());
    } else if (mode === 'anonymous') {
      this.openAnonymous(play);
    }
  }

  /** The play's progress for a beat sent under `identity`, if it is the one reporting the play. */
  consentedReport(identity: AnalyticsIdentity): AnalyticsPlayReportDto | undefined {
    const play = this.play;
    const segment = play?.segment;
    if (
      !play ||
      segment?.kind !== 'consented' ||
      segment.closed ||
      !sameIdentity(segment.identity, identity)
    ) {
      return undefined;
    }
    return this.report(play, segment);
  }

  /** A beat carrying this report was taken. */
  acknowledged(report: AnalyticsPlayReportDto): void {
    const segment = this.play?.segment;
    if (this.play && segment?.kind === 'consented' && segment.playId === report.playId) {
      this.play.counted ||= !report.continued;
    }
  }

  /** Running time since the last anonymous ping, handed over once whether or not it arrives. */
  takeAnonymousMs(): number | undefined {
    const play = this.play;
    const segment = play?.segment;
    if (!play || segment?.kind !== 'anonymous') {
      return undefined;
    }
    const now = play.clock.activeMs;
    const delta = now - segment.watermark;
    segment.watermark = now;
    return delta > 0 ? Math.min(Math.round(delta), MAX_PING_PLAY_MS) : undefined;
  }

  private identity(): AnalyticsIdentity {
    return { visitorId: ensureVisitorId(), sessionId: touchSession() };
  }

  private openConsented(play: Play, identity: AnalyticsIdentity): void {
    const segment: ConsentedSegment = {
      kind: 'consented',
      identity,
      playId: randomId(),
      continued: play.counted,
      base: play.clock.activeMs,
      openedAt: Date.now(),
      dispatched: 0,
      closed: false,
    };
    play.segment = segment;
    this.sendPlay(play, segment, 'START', this.report(play, segment), undefined, false, 0);
  }

  private openAnonymous(play: Play): void {
    play.segment = { kind: 'anonymous', watermark: play.clock.activeMs };
    if (!play.counted) {
      play.counted = true;
      this.ping(play, 'PLAY_START', 0, false);
    }
  }

  private closeSegment(play: Play, reason: PlayEndReason, keepalive: boolean): void {
    const segment = play.segment;
    if (segment?.kind === 'consented') {
      this.endConsented(play, segment, reason, keepalive);
    } else if (segment?.kind === 'anonymous') {
      this.ping(play, 'FLUSH', play.clock.activeMs - segment.watermark, keepalive);
    }
    play.segment = null;
  }

  private endConsented(
    play: Play,
    segment: ConsentedSegment,
    reason: PlayEndReason,
    keepalive: boolean,
  ): void {
    if (segment.closed) {
      return;
    }
    const report = this.report(play, segment);
    segment.closed = true;
    this.sendPlay(play, segment, 'END', report, reason, keepalive, 0);
  }

  private report(play: Play, segment: ConsentedSegment): AnalyticsPlayReportDto {
    const activeMs = Math.max(0, Math.floor(play.clock.activeMs - segment.base));
    segment.dispatched = Math.max(segment.dispatched, activeMs);
    return {
      playId: segment.playId,
      releaseId: play.releaseId,
      continued: segment.continued,
      activeMs,
      startAgeMs: Math.max(0, Date.now() - segment.openedAt),
    };
  }

  private sendPlay(
    play: Play,
    segment: ConsentedSegment,
    phase: AnalyticsPlayDto['phase'],
    report: AnalyticsPlayReportDto,
    endReason: PlayEndReason | undefined,
    keepalive: boolean,
    attempt: number,
  ): void {
    const body: AnalyticsPlayDto = { ...segment.identity, play: report, phase, endReason };
    this.transport
      .post<AnalyticsPlayResponseDto>('/analytics/play', body, { keepalive })
      .then((answer) => {
        if (answer) {
          this.playAnswered(play, segment, report, answer);
        }
      })
      .catch((error: unknown) => {
        const delay = PLAY_RETRY_DELAYS_MS[attempt];
        if (keepalive || !(error instanceof TransientTransportError) || delay === undefined) {
          return;
        }
        setTimeout(() => {
          this.sendPlay(play, segment, phase, report, endReason, false, attempt + 1);
        }, delay);
      });
  }

  private playAnswered(
    play: Play,
    segment: ConsentedSegment,
    report: AnalyticsPlayReportDto,
    answer: AnalyticsPlayResponseDto,
  ): void {
    applyRotation(segment.identity, answer);
    if (answer.disabled) {
      this.features.disableAnalytics();
      return;
    }
    if (answer.rotateVisitor || answer.rotateSession || answer.status !== 'ok') {
      segment.closed = true;
      play.refused ||= answer.status === 'rejected';
      return;
    }
    play.counted ||= !report.continued;
  }

  private ping(play: Play, kind: 'PLAY_START' | 'FLUSH', playMs: number, keepalive: boolean): void {
    if (kind === 'FLUSH' && playMs <= 0) {
      return;
    }
    void this.transport
      .post(
        '/analytics/ping',
        {
          kind,
          state: 'PLAYING',
          signedIn: this.auth.isAuthenticated(),
          releaseId: play.releaseId,
          playMs: kind === 'FLUSH' ? Math.min(Math.round(playMs), MAX_PING_PLAY_MS) : undefined,
        },
        { keepalive },
      )
      .catch(() => undefined);
  }
}
