import type { Commit } from '@shared/git';

export interface ParsedQuery {
  file?: string;
  author?: string;
  branch?: string;
  hash?: string;
  message?: string;
}

/** Parse graph search tokens: author:, branch:, file:, hash:, plus free-text message. */
export function parseSearchQuery(query: string): ParsedQuery {
  const parts = query.trim().split(/\s+/);
  const result: ParsedQuery = {};
  const messageParts: string[] = [];

  for (const part of parts) {
    if (part.startsWith('author:')) {
      result.author = part.slice('author:'.length).toLowerCase();
    } else if (part.startsWith('branch:')) {
      result.branch = part.slice('branch:'.length).toLowerCase();
    } else if (part.startsWith('file:')) {
      result.file = part.slice('file:'.length);
    } else if (part.startsWith('hash:')) {
      result.hash = part.slice('hash:'.length).toLowerCase();
    } else if (part.trim() !== '') {
      messageParts.push(part);
    }
  }

  if (messageParts.length > 0) {
    result.message = messageParts.join(' ').toLowerCase();
  }

  return result;
}

/** Client-side filter applied after the server log query returns. */
export function filterCommitsByQuery(
  commits: readonly Commit[],
  parsed: ParsedQuery,
): Commit[] {
  return commits.filter((commit) => {
    if (
      parsed.author
      && !commit.author.name.toLowerCase().includes(parsed.author)
      && !commit.author.email.toLowerCase().includes(parsed.author)
    ) {
      return false;
    }
    if (parsed.branch && !commit.refs.some((r) => r.shortName.toLowerCase().includes(parsed.branch!))) {
      return false;
    }
    if (parsed.hash && !commit.sha.toLowerCase().startsWith(parsed.hash)) {
      return false;
    }
    if (parsed.message) {
      const m = parsed.message;
      const subjectMatch = commit.subject.toLowerCase().includes(m);
      const authorMatch = commit.author.name.toLowerCase().includes(m);
      const shaMatch = commit.sha.toLowerCase().startsWith(m);
      const refMatch = commit.refs.some((r) => r.shortName.toLowerCase().includes(m));
      if (!subjectMatch && !authorMatch && !shaMatch && !refMatch) {
        return false;
      }
    }
    return true;
  });
}
