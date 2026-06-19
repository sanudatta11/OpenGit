/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}', './electron/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--color-bg)',
          panel: 'var(--color-bg-panel)',
          elevated: 'var(--color-bg-elevated)',
          hover: 'var(--color-bg-hover)',
          input: 'var(--color-bg-input)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)',
          subtle: 'var(--color-border-subtle)',
        },
        fg: {
          DEFAULT: 'var(--color-fg)',
          muted: 'var(--color-fg-muted)',
          dim: 'var(--color-fg-dim)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          subtle: 'var(--color-accent-subtle)',
        },
        git: {
          added: 'var(--color-git-added)',
          modified: 'var(--color-git-modified)',
          deleted: 'var(--color-git-deleted)',
          renamed: 'var(--color-git-renamed)',
          untracked: 'var(--color-git-untracked)',
          conflicted: 'var(--color-git-conflicted)',
          staged: 'var(--color-git-added)',
          remote: 'var(--color-git-remote)',
          local: 'var(--color-git-local)',
          stash: 'var(--color-git-stash)',
          worktree: 'var(--color-git-worktree)',
          branch: 'var(--color-git-branch)',
          tag: 'var(--color-git-tag)',
          head: 'var(--color-git-head)',
        },
        lane: {
          0: 'var(--color-lane-0)',
          1: 'var(--color-lane-1)',
          2: 'var(--color-lane-2)',
          3: 'var(--color-lane-3)',
          4: 'var(--color-lane-4)',
          5: 'var(--color-lane-5)',
          6: 'var(--color-lane-6)',
          7: 'var(--color-lane-7)',
          8: 'var(--color-lane-8)',
          9: 'var(--color-lane-9)',
          10: 'var(--color-lane-10)',
          11: 'var(--color-lane-11)',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
        sans: ['ui-sans-serif', 'system-ui', 'Inter', 'sans-serif'],
      },
      fontSize: {
        xxs: ['10px', '14px'],
        xs: ['11px', '16px'],
        sm: ['12px', '18px'],
        md: ['13px', '20px'],
      },
      keyframes: {
        'slide-in': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(-100%)', opacity: '0' },
        },
      },
      animation: {
        'slide-in': 'slide-in 300ms ease-out',
        'slide-down': 'slide-down 300ms ease-out',
        'slide-up': 'slide-up 200ms ease-in',
      },
    },
  },
  plugins: [],
};
