export interface ToolGroup {
  label: string;
  tools: readonly string[];
}

export const CAPABILITY_TOOL_GROUPS: Record<string, ToolGroup[]> = {
  github: [
    {
      label: 'Read',
      tools: [
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
    {
      label: 'Write — Issues',
      tools: [
        'create_issue',
        'update_issue',
        'add_issue_comment',
      ],
    },
    {
      label: 'Write — Pull requests',
      tools: [
        'create_pull_request',
        'update_pull_request',
        'merge_pull_request',
        'create_pull_request_review',
        'add_pull_request_review_comment',
      ],
    },
    {
      label: 'Write — Files',
      tools: [
        'create_branch',
        'create_or_update_file',
        'delete_file',
        'push_files',
      ],
    },
    {
      label: 'Write — Repositories',
      tools: [
        'create_repository',
        'fork_repository',
      ],
    },
  ],
};

// The secure baseline applied when an agent has no per-agent toolAllowlist.
// Must match the toolAllowlist seeded in the capabilities migration.
export const DEFAULT_TOOL_ALLOWLISTS: Record<string, readonly string[]> = {
  github: CAPABILITY_TOOL_GROUPS.github![0]!.tools,
};
