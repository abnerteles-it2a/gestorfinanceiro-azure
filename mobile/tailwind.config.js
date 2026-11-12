/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./screens/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0D9488',
          hover: '#0F766E',
          light: '#2DD4BF',
          subtle: '#CCFBF1',
          bg: '#F0FDFA',
        },
        teal: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        indigo: {
          50:  '#f4f6f8',
          100: '#e4e9f0',
          200: '#c9d4e2',
          300: '#9eafc5',
          400: '#6f86a3',
          500: '#4f6484',
          600: '#0d9488', // Alinhado com a marca corporativa IT2A
          700: '#0f766e',
          800: '#115e59',
          900: '#041226',
          950: '#020817',
        },
        slate: {
          900: '#0B1E3B',
          950: '#020817',
        },
      },
    },
  },
  plugins: [],
};

