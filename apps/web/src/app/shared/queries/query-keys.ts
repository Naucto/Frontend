export const qk = {
  /** Prefix of every releases query, to invalidate them all at once. */
  releasesAll: () => ['releases'] as const,
  releases: (params: Record<string, unknown>) => ['releases', params] as const,
  release: (id: string | null) => ['release', id] as const,
  releaseImage: (id: string | null) => ['release', id, 'image'] as const,
  releaseContentUrl: (id: string) => ['release', id, 'content-url'] as const,
  likeStatus: (id: string) => ['release', id, 'like'] as const,
  /** Every page of a release's comments, to invalidate them all at once. */
  commentsAll: (id: string) => ['release', id, 'comments'] as const,
  comments: (id: string, page: number) => ['release', id, 'comments', page] as const,
  /** Every project query at once — what a fork invalidates, since it can land on any shelf. */
  projectsAll: () => ['projects'] as const,
  /** Every profile query at once — what editing your own profile invalidates. */
  profileAll: () => ['profile'] as const,
  profile: (username: string) => ['profile', username] as const,
  profileGames: (userId: string) => ['profile', userId, 'games'] as const,
  profileLiked: (userId: string) => ['profile', userId, 'liked'] as const,
  profileCollabs: (userId: string) => ['profile', userId, 'collabs'] as const,
  profileRemixes: (userId: string) => ['profile', userId, 'remixes'] as const,
  friendship: (userId: string) => ['friendship', userId] as const,
  me: () => ['me'] as const,
  myAnalytics: () => ['me', 'analytics'] as const,
  feedbackPrompt: () => ['me', 'feedback-prompt'] as const,
  /** Every page of the account's standing, which a moderation notice invalidates at once. */
  standingAll: () => ['me', 'standing'] as const,
  standing: (page: number) => ['me', 'standing', page] as const,
  myProjects: (params: Record<string, unknown>) => ['projects', 'mine', params] as const,
  projectImage: (id: string | null) => ['project', id, 'image'] as const,
  /** Autosaves — the server writes one on every save, so this is what a save invalidates. */
  projectVersions: (id: string) => ['project', id, 'versions'] as const,
  /** Named versions, which only a checkpoint or a publish touches. */
  projectCheckpoints: (id: string) => ['project', id, 'checkpoints'] as const,
  /** Deployment-wide, so it carries no project id. */
  projectLimits: () => ['project', 'limits'] as const,
  userAvatar: (id: string | null) => ['user', id, 'avatar'] as const,
  /** What the suggestion panel asks for, and everything that makes its answer different. */
  searchSuggest: (term: string, tagsOnly: boolean, signedIn: boolean) =>
    ['search', 'suggest', term, tagsOnly, signedIn] as const,
  /** The limit is part of the answer: two widgets asking for different counts must not share one. */
  searchPeople: (term: string, limit: number) => ['search', 'people', term, limit] as const,
  /** The friends list, and the prefix of every friends query, so invalidating it refreshes them all. */
  friends: () => ['friends'] as const,
  friendRequests: () => ['friends', 'requests'] as const,
  recentPlayers: () => ['friends', 'recent'] as const,
  sessions: (projectId: string) => ['sessions', projectId] as const,
  /** The sessions a reader may join, whatever the game. */
  openSessions: () => ['sessions', 'open'] as const,
  /** One session by its id; the code is part of who may read it. */
  session: (uuid: string | null, code: string | null) => ['session', uuid, code] as const,
  /** Who plays under which number in a session, as of the players at its table. */
  sessionPlayers: (uuid: string | null, table: readonly number[]) =>
    ['sessions', 'players', uuid, table] as const,
  /** Every hub query at once: the feed, its shelves and the results drawn from them. */
  hubAll: () => ['hub'] as const,
  /** The feed is drawn for its reader, so each account, and no account, has its own. */
  hubFeed: (userId: string | null) => ['hub', 'feed', userId] as const,
  hubShelves: (keys: readonly string[]) => ['hub', 'shelves', keys] as const,
  hubResults: (params: Record<string, unknown>) => ['hub', 'results', params] as const,
  releaseTags: (limit: number) => ['releases', 'tags', limit] as const,
  /** Every list of collections at once: what any change to one of them invalidates. */
  collectionLists: () => ['collections'] as const,
  collectionsPage: (params: Record<string, unknown>) => ['collections', 'public', params] as const,
  /** The viewer's own, with the game each is asked about: null when none is. */
  myCollections: (projectId: string | null) => ['collections', 'mine', projectId] as const,
  userCollections: (userId: string) => ['collections', 'of', userId] as const,
  /** One collection whoever reads it, to invalidate it for every viewer at once. */
  collectionAll: (id: string) => ['collection', id] as const,
  /** What a collection answers depends on who asks: a private one is its owner's alone. */
  collection: (id: string, viewer: string | null) => ['collection', id, viewer] as const,
};
