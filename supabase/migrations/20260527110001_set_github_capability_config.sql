-- Marks the builtin `github` capability as an MCP capability. The agent
-- runtime treats a capability whose `config.url` is set as MCP: it connects
-- to that remote MCP server, sends the owner's stored `authKeyType`
-- credential as a bearer token, and surfaces only the tools in
-- `toolAllowlist`.
--
-- GitHub's MCP server exposes ~42 tools including destructive writes
-- (create_or_update_file, delete_file, create_pull_request, ...). The
-- allowlist deliberately keeps only read-only tools: the agent is driven by
-- untrusted LINE / web content, so it must never hold a write capability it
-- could be prompt-injected into using. (A fine-grained PAT's read-only
-- scope does NOT filter the server's tool list, so this allowlist is the
-- enforcement point, not the token.)
update public.capabilities
set config = jsonb_build_object(
  'url', 'https://api.githubcopilot.com/mcp/',
  'authKeyType', 'github',
  'toolAllowlist', jsonb_build_array(
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
    'search_users'
  )
)
where slug = 'github' and owner_id is null;
