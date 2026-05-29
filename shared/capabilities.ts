// Single source of truth for fermi-shipped (built-in) capability metadata.
// Built-in capabilities have an `owner_id IS NULL` row in `public.capabilities`
// only as an FK target for `agent_capabilities.capability_id`; their metadata
// (displayName, description, MCP config, tool allowlist) lives here. BYO
// capabilities (`owner_id IS NOT NULL`) keep their config in the DB row since
// the user supplies it at creation time.

// Config attached to a capability. An MCP capability is identified by `url`
// (its tools come from a remote MCP server); in-process capabilities leave
// this empty and have their tool defined under `supabase/functions/agent/tools/`.
export interface CapabilityConfig {
  url?:         string;
  authKeyType?: string;
  // Flat read-only allowlist used by capabilities that don't group tools
  // (e.g. github). Only listed names are surfaced to the LLM.
  tools?:       string[];
  // Grouped allowlist used by capabilities with too many tools to expose at
  // once (e.g. twinkle-hub). Effective allowlist is the union of
  // `toolGroups[g].tools` for g in `agent_capability.config.enabledGroups`.
  toolGroups?:  Record<string, ToolGroup>;
}

export interface ToolGroup {
  label: string;
  tools: string[];
}

export type CredentialType = 'none' | 'providers' | 'coming_soon';

export interface ProviderMeta {
  slug:        string;
  displayName: string;
  keyType:     string;
  status:      'live' | 'coming_soon';
}

export interface BuiltInCapability {
  displayName:    string;
  // UI catalog blurb; NOT the LLM-facing tool description. In-process tools
  // carry their LLM description on the `Tool` object; MCP tools get theirs
  // from the remote server's `listTools` response.
  description:    string;
  config:         CapabilityConfig;
  credentialType: CredentialType;
  providers?:     ProviderMeta[];
}

export const BUILT_IN_CAPABILITIES: Record<string, BuiltInCapability> = {
  'time': {
    displayName:    'Time',
    description:    'Get the current wall-clock time in any IANA timezone (e.g. "Asia/Taipei", "UTC"). Use whenever the answer depends on the current moment, today\'s date, current time, age of a recent event.',
    config:         {},
    credentialType: 'none',
  },
  'web-search': {
    displayName:    'Web search',
    description:    'Search the web for current information beyond the model\'s training cutoff. Returns ranked titles, snippets, and URLs.',
    config:         {},
    credentialType: 'providers',
    providers:      [
      { slug: 'tavily', displayName: 'Tavily', keyType: 'tavily', status: 'live' },
    ],
  },
  'web-fetch': {
    displayName:    'Web fetch',
    description:    'Fetch and return the text contents of a specific URL. Use after web-search returns a promising link, or when the user supplies a URL directly.',
    config:         {},
    credentialType: 'none',
  },
  'image-gen': {
    displayName:    'Image generation',
    description:    'Generate an image from a natural-language prompt. Use when the user explicitly asks to "draw", "generate an image", "make a picture", or similar; do NOT use to fetch existing images from the web.',
    config:         {},
    credentialType: 'none',
  },
  // GitHub's MCP server exposes ~42 tools including destructive writes. The
  // allowlist keeps only read-only tools: the agent is driven by untrusted
  // LINE / web content, so it must never hold a write capability it could be
  // prompt-injected into using. A fine-grained PAT's read-only scope does
  // NOT filter the server's tool list, so this allowlist is the enforcement
  // point, not the token.
  'github': {
    displayName: 'GitHub',
    description: 'Browse repositories, issues, pull requests, and source code on the connected GitHub account.',
    config:      {
      url:         'https://api.githubcopilot.com/mcp/',
      authKeyType: 'github',
      tools:       [
        'get_commit',
        'get_file_contents',
        'get_label',
        'get_latest_release',
        'get_me',
        'get_release_by_tag',
        'get_tag',
        'get_team_members',
        'get_teams',
        'issue_read',
        'list_branches',
        'list_commits',
        'list_issue_types',
        'list_issues',
        'list_pull_requests',
        'list_releases',
        'list_repository_collaborators',
        'list_tags',
        'pull_request_read',
        'search_code',
        'search_issues',
        'search_pull_requests',
        'search_repositories',
        'search_users',
      ],
    },
    credentialType: 'providers',
    providers:      [
      { slug: 'github', displayName: 'GitHub', keyType: 'github', status: 'live' },
    ],
  },
  'google-calendar': {
    displayName:    'Google Calendar',
    description:    'Read and create events on the connected Google Calendar.',
    config:         {},
    credentialType: 'coming_soon',
  },
  'notion': {
    displayName:    'Notion',
    description:    'Read and update pages and databases in the connected Notion workspace.',
    config:         {},
    credentialType: 'coming_soon',
  },
};

export const getBuiltInCapability = (slug: string): BuiltInCapability | null =>
  BUILT_IN_CAPABILITIES[slug] ?? null;
