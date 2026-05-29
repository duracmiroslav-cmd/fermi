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
  url?:                  string;
  authKeyType?:          string;
  // Flat read-only allowlist used by capabilities that don't group tools
  // (e.g. github). Only listed names are surfaced to the LLM.
  tools?:                string[];
  // Grouped allowlist used by capabilities with too many tools to expose at
  // once (e.g. twinkle-hub). Effective allowlist is the union of
  // `toolGroups[g].tools` for g in the agent's `enabledGroups`.
  toolGroups?:           Record<string, ToolGroup>;
  // Set on the capability's catalog config: which groups apply when the
  // agent binding hasn't recorded an explicit `enabledGroups` yet.
  defaultEnabledGroups?: string[];
  // Set on the per-agent override (`agent_capabilities.config`): the user's
  // current selection of groups for this binding. Shallow-merges onto the
  // catalog config, overriding `defaultEnabledGroups`.
  enabledGroups?:        string[];
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
  // Twinkle Hub bundles Taiwan-specific lookup tools + data.gov.tw open
  // data queries behind one MCP endpoint. The upstream surface is too large
  // (65 tools as of 2026-05) to expose all at once: each agent picks
  // `enabledGroups` and the dispatcher unions those groups' `tools` into
  // the LLM allowlist.
  //
  // The 12 tools deliberately omitted across groups are: `current_time_in`
  // (overlaps fermi's in-process `time`), `fetch_url_as_markdown` (overlaps
  // `web-fetch`, which has SSRF guards), `simplified_to_traditional` and
  // `traditional_to_simplified` (OpenCC is fermi-owned core policy),
  // `generate_test_taiwan_id` and `generate_test_tax_id` (dev fixtures),
  // and the 6 coordinate-based GIS tools (`list_geo_themes`,
  // `query_geo_theme_buffer`, `query_geo_theme_nearest`,
  // `lookup_statistics_by_coord`, `lookup_zip33_by_coord`,
  // `lookup_district_by_coord`) — LINE webhook drops location messages,
  // so no GPS source ever reaches the agent.
  'twinkle-hub': {
    displayName: 'Twinkle Hub',
    description: 'Look up Taiwan-specific information: dates and holidays (incl. ROC year / makeup days), addresses, postal codes, bank codes, MRT routes, company registration, ID / tax-ID validation, lunar calendar, and 50K+ government open datasets.',
    config:      {
      url:         'https://api.twinkleai.tw/mcp/',
      authKeyType: 'twinkle',
      toolGroups:  {
        lookup: {
          label: '一般查詢（日期 / 身分 / 銀行 / 捷運 / 農曆）',
          tools: [
            'twtools-is_taiwan_business_day',
            'twtools-lookup_holidays',
            'twtools-roc_year_to_western',
            'twtools-western_year_to_roc',
            'twtools-validate_taiwan_id_number',
            'twtools-validate_tax_id_number',
            'twtools-lookup_bank_code',
            'twtools-lookup_mrt_line',
            'twtools-validate_license_plate',
            'twtools-validate_phone',
            'twtools-lookup_24_solar_terms',
            'twtools-lookup_zodiac',
            'twtools-lunar_to_solar',
            'twtools-solar_to_lunar',
          ],
        },
        directory: {
          label: '地址 + 公司資料',
          tools: [
            'twtools-address_en_to_zh',
            'twtools-address_zh_to_en',
            'twtools-address_to_postal_code',
            'twtools-normalize_taiwan_address',
            'twtools-validate_postal_code',
            'twtools-lookup_zip33_by_road',
            'twtools-lookup_admin_code',
            'twtools-extract_admin_code_from_addr',
            'twtools-lookup_administrative_district',
            'twtools-lookup_county_basic_info',
            'twtools-align_legacy_county',
            'twtools-list_districts_in_county',
            'twtools-lookup_company_by_tax_id',
            'twtools-search_company_by_name',
            'twtools-lookup_company_branches',
            'twtools-lookup_company_executives',
            'twtools-lookup_company_status_code',
            'twtools-lookup_business_unit_type',
            'twtools-lookup_capital_range',
            'twtools-lookup_industry_code',
            'twtools-lookup_government_agency_code',
          ],
        },
        utility: {
          label: '通用工具（時間 / PDF / 中文數字）',
          tools: [
            'twtools-duration_humanize',
            'twtools-timezone_convert',
            'twtools-extract_pdf_metadata',
            'twtools-extract_pdf_pages',
            'twtools-extract_pdf_text',
            'twtools-format_chinese_numerals',
          ],
        },
        // Off by default (see `defaultEnabledGroups` below) because
        // opendata-* queries are heavier than utility lookups and likeliest
        // to attract per-call pricing when Twinkle Hub leaves alpha. Covers
        // dataset discovery + the three vertical corpora Twinkle Hub indexes
        // (考題 / 司法判決 / 專利).
        opendata: {
          label: '政府開放資料查詢',
          tools: [
            'opendata-list_domains',
            'opendata-search_datasets',
            'opendata-get_dataset',
            'opendata-materialize_dataset',
            'opendata-query_rows',
            'opendata-search_exam',
            'opendata-search_exam_questions',
            'opendata-get_exam_paper',
            'opendata-search_judicial',
            'opendata-get_judicial_full',
            'opendata-search_patents',
            'opendata-get_patent_body',
          ],
        },
      },
      defaultEnabledGroups: ['lookup', 'directory', 'utility'],
    },
    credentialType: 'providers',
    providers:      [
      { slug: 'twinkle-hub', displayName: 'Twinkle Hub', keyType: 'twinkle', status: 'live' },
    ],
  },
};

export const getBuiltInCapability = (slug: string): BuiltInCapability | null =>
  BUILT_IN_CAPABILITIES[slug] ?? null;
