export interface KnownRepoEntry {
  path: string;
  name: string;
  isOpen: boolean;
  recencyRank: number;
}

interface RankedRepo {
  entry: KnownRepoEntry;
  score: number;
}

export function rankKnownRepos(entries: readonly KnownRepoEntry[], query: string): KnownRepoEntry[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return [...entries].sort((a, b) => compareRanked({ entry: a, score: 0 }, { entry: b, score: 0 }));
  }

  return entries
    .map((entry) => ({ entry, score: scoreRepo(entry, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort(compareRanked)
    .map((item) => item.entry);
}

function compareRanked(a: RankedRepo, b: RankedRepo): number {
  return b.score - a.score
    || a.entry.name.localeCompare(b.entry.name)
    || a.entry.path.localeCompare(b.entry.path);
}

function scoreRepo(entry: KnownRepoEntry, query: string): number {
  const normalizedName = normalize(entry.name);
  const normalizedPath = normalize(entry.path);
  const nameScore = scoreText(normalizedName, query);
  const pathScore = scoreText(normalizedPath, query);
  const fuzzyName = fuzzyScore(normalizedName, query);
  const fuzzyPath = fuzzyScore(normalizedPath, query);
  const best = Math.max(nameScore, pathScore, fuzzyName, fuzzyPath);

  if (best === 0) return 0;

  let score = best;
  if (entry.isOpen) score += 20;
  score += entry.recencyRank * 3;
  return score;
}

function scoreText(value: string, query: string): number {
  if (value === query) return 180;
  if (value.startsWith(query)) return 140;
  if (value.includes(query)) return 100;
  if (query.split(/\s+/).every((part) => value.includes(part))) return 70;
  return 0;
}

function fuzzyScore(value: string, query: string): number {
  if (!value || !query) return 0;

  let queryIndex = 0;
  let compactBonus = 0;
  for (let i = 0; i < value.length && queryIndex < query.length; i += 1) {
    if (value[i] === query[queryIndex]) {
      compactBonus += i === queryIndex ? 6 : 3;
      queryIndex += 1;
    }
  }

  if (queryIndex !== query.length) return 0;
  return 40 + compactBonus;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/_-]+/g, ' ').trim();
}
