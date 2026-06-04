import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#101214',
        cream: '#f7f3ea',
        muted: '#6d6a62'
      }
    },
  },
  plugins: [],
}
export default config
