import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f172a',
        surface: '#1e293b',
        accent: '#22c55e',
        'accent-dim': '#22c55e20',
        warn: '#f59e0b',
        danger: '#ef4444',
        muted: '#64748b',
      },
    },
  },
  plugins: [],
}
export default config
