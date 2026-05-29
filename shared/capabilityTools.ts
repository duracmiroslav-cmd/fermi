// Tool groups for capability config UI, organized as a (resource × access)
// matrix: each row is a GitHub resource type, split into read / write
// columns. The matrix layout makes the safety boundary visible at a
// glance (write column collapses to empty for read-only resources) while
// preserving structural parallelism across resources.
//
// `DEFAULT_TOOL_ALLOWLISTS` flattens every `read` column to form the
// secure baseline; its set membership must match the `toolAllowlist`
// seeded in the capabilities migration (order is irrelevant — allowlists
// are sets).

export interface ResourceGroup {
  resource: string;
  read:     readonly string[];
  write:    readonly string[];
}

export const CAPABILITY_TOOL_GROUPS: Record<string, ResourceGroup[]> = {
  github: [
    {
      resource: 'Issues',
      read:     ['list_issues', 'issue_read', 'list_issue_types', 'get_label'],
      write:    ['create_issue', 'update_issue', 'add_issue_comment'],
    },
    {
      resource: 'Pull requests',
      read:     ['list_pull_requests', 'pull_request_read'],
      write:    [
        'create_pull_request',
        'update_pull_request',
        'merge_pull_request',
        'create_pull_request_review',
        'add_pull_request_review_comment',
      ],
    },
    {
      resource: 'Files & commits',
      read:     ['get_file_contents', 'get_commit', 'list_commits', 'list_branches'],
      write:    ['create_or_update_file', 'delete_file', 'push_files', 'create_branch'],
    },
    {
      resource: 'Repositories',
      read:     ['list_repository_collaborators'],
      write:    ['create_repository', 'fork_repository'],
    },
    {
      resource: 'Releases & tags',
      read:     ['get_latest_release', 'get_release_by_tag', 'list_releases', 'get_tag', 'list_tags'],
      write:    [],
    },
    {
      resource: 'Account & teams',
      read:     ['get_me', 'get_teams', 'get_team_members'],
      write:    [],
    },
    {
      resource: 'Search',
      read:     ['search_code', 'search_issues', 'search_pull_requests', 'search_repositories', 'search_users'],
      write:    [],
    },
  ],
};

export const DEFAULT_TOOL_ALLOWLISTS: Record<string, readonly string[]> = {
  github: CAPABILITY_TOOL_GROUPS.github!.flatMap(g => g.read),
};
