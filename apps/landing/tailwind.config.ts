import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.25rem',
      screens: {
        '2xl': '1280px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'sans-serif'],
        display: ['"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      backgroundImage: {
        'paper-grid':
          'linear-gradient(to right, hsl(var(--border) / 0.32) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.32) 1px, transparent 1px)',
        'console-lights':
          'radial-gradient(circle at 18% 14%, hsl(var(--secondary) / 0.24), transparent 38%), radial-gradient(circle at 82% 8%, hsl(var(--primary) / 0.24), transparent 34%), radial-gradient(circle at 50% 100%, hsl(var(--accent) / 0.2), transparent 44%)',
      },
      keyframes: {
        enter: {
          '0%': { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        floatSoft: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        enter: 'enter 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'float-soft': 'floatSoft 9s ease-in-out infinite',
      },
      boxShadow: {
        panel: '0 24px 52px -34px hsl(var(--foreground) / 0.35)',
        console: '0 34px 86px -44px hsl(var(--foreground) / 0.58)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;

export default config;
