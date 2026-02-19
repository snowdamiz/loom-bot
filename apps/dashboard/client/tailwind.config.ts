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
        sans: ['Outfit', 'sans-serif'],
        display: ['Sora', 'sans-serif'],
      },
      backgroundImage: {
        'grain-radial':
          'radial-gradient(circle at 18% 8%, hsl(var(--primary) / 0.22), transparent 38%), radial-gradient(circle at 84% 14%, hsl(var(--secondary) / 0.22), transparent 40%), radial-gradient(circle at 55% 82%, hsl(var(--accent) / 0.18), transparent 45%)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        drift: {
          '0%, 100%': { transform: 'translateX(-14px)' },
          '50%': { transform: 'translateX(12px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
      },
      animation: {
        rise: 'rise 700ms cubic-bezier(0.21, 1.02, 0.73, 1) both',
        float: 'float 7s ease-in-out infinite',
        drift: 'drift 12s ease-in-out infinite',
        shimmer: 'shimmer 5s linear infinite',
      },
      boxShadow: {
        glow: '0 24px 80px -30px hsl(var(--primary) / 0.65)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;

export default config;
