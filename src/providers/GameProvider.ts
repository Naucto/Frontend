import {
  projectControllerGetProjectPreviewContent,
  projectControllerGetReleaseContent,
  projectControllerGetReleaseContentUrl,
} from "@api";
import { seedDefaultProjectContent } from "@shared/project/defaultProjectContent";
import { decodeUpdate } from "@utils/YSerialize";

import { MapProvider } from "./editors/MapProvider";
import { ProjectSettingsProvider } from "./editors/ProjectSettingsProvider";
import { SoundProvider } from "./editors/SoundProvider";
import { SpriteProvider } from "./editors/SpriteProvider";

import { AxiosError } from "axios";
import * as Y from "yjs";

export enum ProviderEventType {
  INITIALIZED
}

/**
 * Where a game's bytes come from.
 *
 * "release" is the public path: the published artifact, served through the CDN.
 * "preview" is the staff path: any project, published or not, read straight from
 * the API. A project under moderation usually has no release to serve, so the
 * preview endpoint falls back to its latest save.
 */
export type GameContentSource = "release" | "preview";

class ReleaseContentFetchError extends Error {
  constructor(public readonly status: number, url: string) {
    super(`Failed to fetch release content from ${url}: ${status}`);
    this.name = "ReleaseContentFetchError";
  }
}

export class GameProvider implements Destroyable {
  private readonly _doc: Y.Doc;

  private _listeners : Map<ProviderEventType, Set<() => void>> = new Map();
  private _initialized: boolean = false;

  public isHost: boolean;
  public code!: string;
  public sprite!: SpriteProvider;
  public map!: MapProvider;
  public projectSettings!: ProjectSettingsProvider;
  public sound!: SoundProvider;
  public projectId: number;

  private readonly _source: GameContentSource;

  constructor(projectId: number, source: GameContentSource = "release") {
    this.projectId = projectId;
    this._source = source;
    this.isHost = false;
    this._doc = new Y.Doc();

    this.initializeDoc().then(() => {
      this.code = this._doc.getText("monaco").toString();
      this.sprite = new SpriteProvider(this._doc);
      this.map = new MapProvider(this._doc, { width:128, height:32 }, 2, this.sprite);
      this.sound = new SoundProvider(this._doc);
      this._initialized = true;

      this.emit(ProviderEventType.INITIALIZED);

    });
  }

  /**
   * Staff preview loader. There is no signed CDN URL to try here: an unpublished
   * project has no public release object, so the content comes from the
   * role-guarded API endpoint directly.
   */
  private async initializeFromPreview(): Promise<void> {
    try {
      const { data: content } = await projectControllerGetProjectPreviewContent({
        path: { id: String(this.projectId) },
      });
      await decodeUpdate(this._doc, content as Blob);
    } catch (error: unknown) {
      // A project with no save yet still opens -- as the empty default project.
      if ((error as AxiosError)?.response?.status === 404) {
        console.warn("No preview content for project", this.projectId);
      } else {
        throw error;
      }
    }

    seedDefaultProjectContent(this._doc);
  }

  private async initializeDoc(): Promise<void> {
    if (this._source === "preview") {
      await this.initializeFromPreview();
      return;
    }

    try {
      const signed = (await projectControllerGetReleaseContentUrl({ path: { id: String(this.projectId) } })).data;
      if (signed?.signedUrl) {
        try {
          let requestUrl = signed.signedUrl;
          if (typeof window !== "undefined") {
            try {
              const url = new URL(signed.signedUrl);
              if (url.hostname.endsWith(".svc.edge.scw.cloud")) {
                url.searchParams.set("cors_bust", Date.now().toString());
                requestUrl = url.toString();
              }
            } catch {
              requestUrl = signed.signedUrl;
            }
          }

          const response = await fetch(requestUrl);
          if (!response.ok) {
            throw new ReleaseContentFetchError(response.status, requestUrl);
          }
          const blob = await response.blob();
          await decodeUpdate(this._doc, blob);
          return;
        } catch {
          console.warn("Failed to fetch release content with signed URL, falling back to API endpoint");
        }
      }

      const { data: content } = await projectControllerGetReleaseContent({ path: { id: String(this.projectId) } });
      await decodeUpdate(this._doc, content as Blob);
    } catch (error: unknown) {
      if ((error as AxiosError)?.response?.status === 404) {
        console.error("Failed to fetch project content:", error);
      } else {
        throw error;
      }
    }

    seedDefaultProjectContent(this._doc);
  }

  destroy(): void {
    if (this.sprite) {
      this.sprite.destroy();
    }
    if (this.map) {
      this.map.destroy();
    }
    this._doc.destroy();
  }

  public observe(event: ProviderEventType, callback: () => void): void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)?.add(callback);

    if (event === ProviderEventType.INITIALIZED && this._initialized) {
      callback();
    }
  }

  emit(event: ProviderEventType): void {
    this._listeners.get(event)?.forEach(callback => callback());
  }
}
