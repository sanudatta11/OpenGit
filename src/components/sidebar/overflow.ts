export function branchNameClassName(isHead: boolean): string {
  return [
    'min-w-0',
    'whitespace-normal',
    'break-all',
    'text-left',
    'hover:text-accent',
    'font-medium',
    isHead ? 'text-fg font-semibold' : 'text-fg-muted',
  ].join(' ');
}

export function remoteUrlClassName(): string {
  return 'min-w-0 whitespace-normal break-all text-xxs text-fg-muted';
}
