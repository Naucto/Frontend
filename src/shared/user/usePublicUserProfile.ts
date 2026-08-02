import {
  PublicUserProfileDto,
  userPublicControllerGetPublicProfileByUsername,
} from "@api";

import { useEffect, useState } from "react";

const profileCache = new Map<string, PublicUserProfileDto | null>();
const pendingProfileRequests = new Map<string, Promise<PublicUserProfileDto | null>>();

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export async function getPublicUserProfile(username: string): Promise<PublicUserProfileDto | null> {
  const cacheKey = normalizeUsername(username);

  if (!cacheKey) {
    return null;
  }

  if (profileCache.has(cacheKey)) {
    return profileCache.get(cacheKey) ?? null;
  }

  const existingRequest = pendingProfileRequests.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = userPublicControllerGetPublicProfileByUsername<true>({
    throwOnError: true,
    path: { username },
  })
    .then(({ data }) => data.data)
    .catch(() => null)
    .then((profile) => {
      profileCache.set(cacheKey, profile);
      pendingProfileRequests.delete(cacheKey);
      return profile;
    });

  pendingProfileRequests.set(cacheKey, request);

  return request;
}

export function usePublicUserProfile(username?: string | null): PublicUserProfileDto | null {
  const cacheKey = username ? normalizeUsername(username) : "";
  const [profile, setProfile] = useState<PublicUserProfileDto | null>(
    cacheKey && profileCache.has(cacheKey) ? profileCache.get(cacheKey) ?? null : null
  );

  useEffect(() => {
    if (!username) {
      setProfile(null);
      return;
    }

    let cancelled = false;

    void getPublicUserProfile(username).then((nextProfile) => {
      if (!cancelled) {
        setProfile(nextProfile);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [username]);

  return profile;
}
