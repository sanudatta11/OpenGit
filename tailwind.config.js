/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}', './electron/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0d1117',
          panel: '#161b22',
          elevated: '#1c2230',
          hover: '#1f2733',
          input: '#0a0d13',
        },
        border: {
          DEFAULT: '#262d3a',
          strong: '#384357',
          subtle: '#1c2230',
        },
        fg: {
          DEFAULT: '#e6edf3',
          muted: '#8b949e',
          dim: '#6e7681',
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#60a5fa',
          subtle: '#1e3a8a',
        },
        git: {
          added: '#3fb950',
          modified: '#d29922',
          deleted: '#f85149',
          renamed: '#58a6ff',
          untracked: '#a371f7',
          conflicted: '#db6d28',
          staged: '#3fb950',
          remote: '#f0883e',
          local: '#a371f7',
          stash: '#d2a8ff',
          worktree: '#79c0ff',
          branch: '#a371f7',
          tag: '#3fb950',
          head: '#d29922',
        },
        lane: {
          0: '#3b82f6',
          1: '#f85149',
          2: '#3fb950',
          3: '#d29922',
          4: '#a371f7',
          5: '#ec4899',
          6: '#14b8a6',
          7: '#f97316',
          8: '#8b5cf6',
          9: '#10b981',
          10: '#eab308',
          11: '#06b6d4',
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
    },
  },
  plugins: [],
};
