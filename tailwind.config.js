/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dce7fd',
          200: '#c0d5fc',
          300: '#95b8fa',
          400: '#6393f5',
          500: '#3e70ef',
          600: '#2852e3',
          700: '#2040d1',
          800: '#1f37a9',
          900: '#1e3385',
        },
        ink: {
          DEFAULT: '#0b1220',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)',
      },
    },
  },
  plugins: [],
}