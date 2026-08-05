import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brass text-bg hover:bg-brass-bright border border-brass',
  secondary: 'bg-surface text-text border border-border hover:border-border-strong',
  ghost: 'bg-transparent text-muted border border-transparent hover:text-text',
};

const SIZES: Record<Size, string> = {
  xs: 'px-2 py-1 text-2xs',
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={`focus-visible:outline-brass-bright inline-flex cursor-pointer items-center justify-center gap-2 rounded-sm font-sans transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
