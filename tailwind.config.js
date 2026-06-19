/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}', './electron/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'rgb(var(--color-bg) / <alpha-value>)',
          panel: 'rgb(var(--color-bg-panel) / <alpha-value>)',
          elevated: 'var(--color-bg-elevated)',
          hover: 'rgb(var(--color-bg-hover) / <alpha-value>)',
          input: 'rgb(var(--color-bg-input) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
          strong: 'var(--color-border-strong)',
          subtle: 'rgb(var(--color-border-subtle) / <alpha-value>)',
        },
        fg: {
          DEFAULT: 'var(--color-fg)',
          muted: 'var(--color-fg-muted)',
          dim: 'rgb(var(--color-fg-dim) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          hover: 'var(--color-accent-hover)',
          subtle: 'var(--color-accent-subtle)',
        },
        git: {
          added: 'rgb(var(--color-git-added) / <alpha-value>)',
          modified: 'rgb(var(--color-git-modified) / <alpha-value>)',
          deleted: 'rgb(var(--color-git-deleted) / <alpha-value>)',
          renamed: 'var(--color-git-renamed)',
          untracked: 'var(--color-git-untracked)',
          conflicted: 'rgb(var(--color-git-conflicted) / <alpha-value>)',
          staged: 'var(--color-git-added)',
          remote: 'rgb(var(--color-git-remote) / <alpha-value>)',
          local: 'var(--color-git-local)',
          stash: 'var(--color-git-stash)',
          worktree: 'var(--color-git-worktree)',
          branch: 'rgb(var(--color-git-branch) / <alpha-value>)',
          tag: 'rgb(var(--color-git-tag) / <alpha-value>)',
          head: 'rgb(var(--color-git-head) / <alpha-value>)',
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
        xxs: ['0.75rem', '1.1'],
        xs: ['0.875rem', '1.25'],
        sm: ['1rem', '1.5'],
        md: ['1.125rem', '1.6'],
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
