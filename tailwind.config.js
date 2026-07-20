/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Dark-first palette. Kept small and semantic.
        bg: '#0B1020',
        surface: '#151B2E',
        surface2: '#1E2740',
        border: '#2A3450',
        text: '#F2F5FF',
        muted: '#9AA7C7',
        primary: '#6C8CFF',
        'primary-dark': '#4A6BF5',
        success: '#3BD671',
        danger: '#FF6B6B',
        warning: '#FFC24B',
        gold: '#FFD34E',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
