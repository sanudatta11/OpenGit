const AUTHOR_COLORS = [
  '#2563eb',
  '#db2777',
  '#7c3aed',
  '#0f766e',
  '#ea580c',
  '#16a34a',
  '#b91c1c',
  '#0891b2',
];

export interface AuthorVisual {
  initials: string;
  fill: string;
}

export function authorVisual(name: string, email: string): AuthorVisual {
  const key = `${name}|${email}`.toLowerCase();
  const idx = fnv1a(key) % AUTHOR_COLORS.length;
  return {
    initials: authorInitials(name, email),
    fill: AUTHOR_COLORS[idx]!,
  };
}

function authorInitials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase();
  }
  if (words.length === 1 && words[0]) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
