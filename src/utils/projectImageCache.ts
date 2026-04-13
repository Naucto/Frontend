type ImageScope = "draft" | "published";

type ImageLoader = () => Promise<string | null | undefined>;

const imageUrlCache = new Map<string, string>();
const imagePromiseCache = new Map<string, Promise<string>>();

function toCacheKey(scope: ImageScope, projectId: number): string {
  return `${scope}:${projectId}`;
}

export async function getCachedProjectImageUrl(
  scope: ImageScope,
  projectId: number,
  loader: ImageLoader,
  fallbackUrl?: string | null,
): Promise<string> {
  const cacheKey = toCacheKey(scope, projectId);

  if (imageUrlCache.has(cacheKey)) {
    return imageUrlCache.get(cacheKey) ?? "";
  }

  const pending = imagePromiseCache.get(cacheKey);
  if (pending) {
    return pending;
  }

  const request = (async () => {
    try {
      const loadedUrl = await loader();
      const resolvedUrl = loadedUrl || fallbackUrl || "";
      imageUrlCache.set(cacheKey, resolvedUrl);
      return resolvedUrl;
    } catch {
      const resolvedUrl = fallbackUrl || "";
      imageUrlCache.set(cacheKey, resolvedUrl);
      return resolvedUrl;
    } finally {
      imagePromiseCache.delete(cacheKey);
    }
  })();

  imagePromiseCache.set(cacheKey, request);
  return request;
}

export function setCachedProjectImageUrl(
  scope: ImageScope,
  projectId: number,
  url?: string | null,
): void {
  imageUrlCache.set(toCacheKey(scope, projectId), url || "");
}

export function invalidateCachedProjectImageUrl(scope: ImageScope, projectId: number): void {
  const cacheKey = toCacheKey(scope, projectId);
  imageUrlCache.delete(cacheKey);
  imagePromiseCache.delete(cacheKey);
}
