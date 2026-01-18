/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Background Colors - Deeper, more professional
        'bg-primary': '#08090c',      // Ultra dark - almost black
        'bg-secondary': '#0f1115',    // Very dark gray
        'bg-tertiary': '#161920',     // Dark charcoal

        // Accent Colors - Vibrant but refined
        'accent-primary': '#7c3aed',  // Deep purple
        'accent-secondary': '#2563eb', // Deep blue
        'accent-success': '#10b981',  // Emerald green
        'accent-warning': '#f59e0b',  // Amber
        'accent-error': '#ef4444',    // Red
        'accent-cyan': '#06b6d4',     // Cyan for highlights

        // Text Colors
        'text-primary': '#f1f5f9',    // Slightly warmer white
        'text-secondary': '#94a3b8',  // Slate gray
        'text-muted': '#64748b',      // Darker muted
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
      backdropBlur: {
        glass: '12px',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0, 0, 0, 0.2)',
      },
    },
  },
  plugins: [],
}
