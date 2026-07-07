// Build-time site configuration.

// Owner mode: the private deployment builds with DRAFTS=1, which
// includes draft content and shows "edit" links on every entry.
export const SHOW_DRAFTS = process.env.DRAFTS === '1';

// Used for "edit on GitHub" links in owner mode.
export const REPO = 'danielslloyd/lloydio';
export const REPO_BRANCH = 'main';

export const SITE_TITLE = 'lloydio';
export const SITE_DESCRIPTION = "Daniel Lloyd's notes, links, essays, and small tools.";

export function editUrl(filePath: string | undefined): string | null {
  if (!filePath) return null;
  return `https://github.com/${REPO}/edit/${REPO_BRANCH}/${filePath}`;
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
