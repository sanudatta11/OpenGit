// electron/main/git/parse/diff.ts — parse `git diff` unified output into structured hunks.
// Also parses `git diff --numstat -z` for file-level summary.

import type { DiffFile, DiffResult, Hunk, DiffLine } from '@shared/git';

/**
 * Parse `git diff --numstat [--find-renames]` output.
 * Handles both newline-separated (default) and NUL-separated (-z) output.
 * Format per entry: "added\tdeleted\tpath". For renames with -z: "added\tdeleted\tnewpath\0oldpath".
 */
export function parseNumstat(raw: string): DiffFile[] {
  // Split on either NUL or newline. Each record is "add\tdel\tpath" (tab-separated).
  const records = raw.split(/[\0\n]/).filter((r) => r.length > 0);
  const files: DiffFile[] = [];

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    const parts = rec.split('\t');
    if (parts.length < 3) continue;

    const additionsStr = parts[0]!;
    const deletionsStr = parts[1]!;
    const additions = additionsStr === '-' ? 0 : parseInt(additionsStr, 10);
    const deletions = deletionsStr === '-' ? 0 : parseInt(deletionsStr, 10);
    const path = parts[2]!;
    const isBinary = additionsStr === '-' || deletionsStr === '-';

    files.push({
      path,
      oldPath: null,  // renames detected via parseUnifiedDiff, not numstat
      isBinary,
      isRename: false,
      isCopy: false,
      additions: isBinary ? 0 : additions,
      deletions: isBinary ? 0 : deletions,
      oldMode: null,
      newMode: null,
    });
  }

  return files;
}

/**
 * Parse unified diff output (`git diff --no-color`) into a DiffResult.
 * Handles:
 *   - File header: "diff --git a/path b/path"
 *   - Extended headers: "index oldsha..newsha mode", "rename from/to", "new file", "deleted file", "similarity index"
 *   - Binary: "Binary files a/... and b/... differ"
 *   - Hunk headers: "@@ -oldStart,oldLines +newStart,newLines @@ section"
 *   - Context/add/del lines
 *   - "No newline at end of file"
 */
export function parseUnifiedDiff(raw: string, filePath: string): DiffResult {
  const lines = raw.split('\n');
  let i = 0;

  // Skip to the first hunk or detect binary/no changes.
  let isBinary = false;
  let isRename = false;
  let isCopy = false;
  let oldPath: string | null = null;
  let additions = 0;
  let deletions = 0;
  let oldMode: string | null = null;
  let newMode: string | null = null;

  // Parse file header + extended headers.
  while (i < lines.length) {
    const line = lines[i]!;

    if (line.startsWith('@@ ')) {
      break; // start of hunks
    }

    if (line.startsWith('diff --git ')) {
      i++;
      continue;
    }

    if (line.startsWith('index ')) {
      // "index oldsha..newsha mode" or "index oldsha..newsha"
      const modeMatch = line.match(/ (\d{6})$/);
      if (modeMatch) newMode = modeMatch[1]!;
      i++;
      continue;
    }

    if (line.startsWith('old mode ')) {
      oldMode = line.slice('old mode '.length);
      i++;
      continue;
    }

    if (line.startsWith('new mode ')) {
      newMode = line.slice('new mode '.length);
      i++;
      continue;
    }

    if (line.startsWith('rename from ')) {
      oldPath = line.slice('rename from '.length);
      isRename = true;
      i++;
      continue;
    }

    if (line.startsWith('rename to ')) {
      i++;
      continue;
    }

    if (line.startsWith('copy from ')) {
      oldPath = line.slice('copy from '.length);
      isCopy = true;
      i++;
      continue;
    }

    if (line.startsWith('copy to ')) {
      i++;
      continue;
    }

    if (line.startsWith('similarity index ') || line.startsWith('dissimilarity index ')) {
      i++;
      continue;
    }

    if (line.startsWith('new file mode ')) {
      newMode = line.slice('new file mode '.length);
      i++;
      continue;
    }

    if (line.startsWith('deleted file mode ')) {
      oldMode = line.slice('deleted file mode '.length);
      i++;
      continue;
    }

    if (line.startsWith('Binary files ') || line === 'Binary files differ') {
      isBinary = true;
      i++;
      continue;
    }

    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      i++;
      continue;
    }

    // Unknown header line — skip.
    i++;
  }

  // Parse hunks.
  const hunks: Hunk[] = [];

  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.startsWith('@@ ')) break;

    // Parse hunk header: "@@ -oldStart,oldLines +newStart,newLines @@ section"
    const headerMatch = line.match(/^@@ -(?:(\d+)(?:,(\d+))?) \+(?:(\d+)(?:,(\d+))?) @@(.*)$/);
    if (!headerMatch) {
      i++;
      continue;
    }

    const oldStart = parseInt(headerMatch[1] ?? '0', 10);
    const oldLines = parseInt(headerMatch[2] ?? '1', 10);
    const newStart = parseInt(headerMatch[3] ?? '0', 10);
    const newLines = parseInt(headerMatch[4] ?? '1', 10);
    const header = line;

    i++;

    // Parse hunk body lines.
    const diffLines: DiffLine[] = [];
    let oldLineNo = oldStart;
    let newLineNo = newStart;

    while (i < lines.length) {
      const bodyLine = lines[i]!;
      if (bodyLine.startsWith('@@ ')) break;
      if (bodyLine.startsWith('diff --git ')) break;

      if (bodyLine.startsWith('\\') && bodyLine.includes('No newline')) {
        diffLines.push({
          type: 'no-newline',
          oldLineNo: null,
          newLineNo: null,
          text: 'No newline at end of file',
        });
        i++;
        continue;
      }

      const prefix = bodyLine[0] ?? '';
      const text = bodyLine.slice(1);

      if (prefix === ' ') {
        diffLines.push({ type: 'context', oldLineNo, newLineNo, text });
        oldLineNo++;
        newLineNo++;
      } else if (prefix === '+') {
        diffLines.push({ type: 'add', oldLineNo: null, newLineNo, text });
        newLineNo++;
        additions++;
      } else if (prefix === '-') {
        diffLines.push({ type: 'del', oldLineNo, newLineNo: null, text });
        oldLineNo++;
        deletions++;
      } else if (prefix === '\\') {
        // "\ No newline at end of file" — already handled above, but just in case
        diffLines.push({ type: 'no-newline', oldLineNo: null, newLineNo: null, text });
      } else {
        // Unexpected line — stop.
        break;
      }

      i++;
    }

    hunks.push({
      oldStart,
      oldLines,
      newStart,
      newLines,
      header,
      lines: diffLines,
    });
  }

  return {
    path: filePath,
    oldPath,
    isBinary,
    isRename,
    isCopy,
    additions,
    deletions,
    oldMode,
    newMode,
    hunks,
  };
}

/**
 * Extract original and modified text from a DiffResult for Monaco DiffEditor.
 * Reconstructs the two file versions from the diff hunks.
 */
export function extractDiffContent(
  diff: DiffResult,
  originalRaw: string,
  modifiedRaw: string,
): { original: string; modified: string } {
  // If we have raw file contents, use them directly (more accurate).
  if (originalRaw !== '\0') return { original: originalRaw, modified: modifiedRaw };

  // Otherwise reconstruct from hunks.
  const originalLines: string[] = [];
  const modifiedLines: string[] = [];

  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'context') {
        originalLines.push(line.text);
        modifiedLines.push(line.text);
      } else if (line.type === 'add') {
        modifiedLines.push(line.text);
      } else if (line.type === 'del') {
        originalLines.push(line.text);
      }
    }
  }

  return {
    original: originalLines.join('\n'),
    modified: modifiedLines.join('\n'),
  };
}

/** Check if content is binary (contains NUL bytes in first 8KB). */
export function isBinaryContent(content: string): boolean {
  const sample = content.slice(0, 8192);
  return sample.includes('\0');
}
