import { motion, AnimatePresence, type Variants } from 'framer-motion';
import type { ReactNode, CSSProperties } from 'react';

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const EASE_OUT = [0.25, 0.46, 0.45, 0.94] as const;

const BASE_DURATION = 0.6;
const STAGGER_INTERVAL = 0.07;

/* ────────────────────── FadeIn ────────────────────── */

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  style?: CSSProperties;
}

export function FadeIn({
  children,
  delay = 0,
  duration = BASE_DURATION,
  className,
  style,
}: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration, delay, ease: EASE_OUT }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/* ────────────────────── FadeUp ────────────────────── */

interface FadeUpProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  distance?: number;
  className?: string;
  style?: CSSProperties;
}

export function FadeUp({
  children,
  delay = 0,
  duration = BASE_DURATION,
  distance = 20,
  className,
  style,
}: FadeUpProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: distance }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: EASE_OUT_EXPO }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/* ────────────────────── Stagger (parent) ────────────────────── */

const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: STAGGER_INTERVAL,
      delayChildren: 0.1,
    },
  },
};

interface StaggerProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  delay?: number;
}

export function Stagger({ children, className, style, delay = 0 }: StaggerProps) {
  return (
    <motion.div
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: STAGGER_INTERVAL,
            delayChildren: 0.1 + delay,
          },
        },
      }}
      initial="hidden"
      animate="visible"
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/* ────────────────────── StaggerItem (child) ────────────────────── */

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE_OUT_EXPO },
  },
};

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function StaggerItem({ children, className, style }: StaggerItemProps) {
  return (
    <motion.div variants={staggerItemVariants} className={className} style={style}>
      {children}
    </motion.div>
  );
}

/* ────────────── StaggerList (for table bodies / lists) ────────────── */

interface StaggerListProps {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'tbody' | 'ul';
  delay?: number;
}

export function StaggerList({
  children,
  className,
  as = 'div',
  delay = 0,
}: StaggerListProps) {
  const Component = as === 'tbody' ? motion.tbody : as === 'ul' ? motion.ul : motion.div;
  return (
    <Component
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: 0.05,
            delayChildren: 0.08 + delay,
          },
        },
      }}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </Component>
  );
}

/* ────────────── StaggerRow (for table rows / list items) ────────────── */

const staggerRowVariants: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.45, ease: EASE_OUT_EXPO },
  },
};

interface StaggerRowProps {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'tr' | 'li';
  [key: string]: unknown;
}

export function StaggerRow({ children, className, as = 'div', ...rest }: StaggerRowProps) {
  const Component = as === 'tr' ? motion.tr : as === 'li' ? motion.li : motion.div;
  return (
    <Component variants={staggerRowVariants} className={className} {...rest}>
      {children}
    </Component>
  );
}

/* ────────────────────── ScaleIn (modals / overlays) ────────────────────── */

interface ScaleInProps {
  children: ReactNode;
  isOpen: boolean;
  className?: string;
  style?: CSSProperties;
  onExitComplete?: () => void;
}

export function ScaleIn({ children, isOpen, className, style, onExitComplete }: ScaleInProps) {
  return (
    <AnimatePresence onExitComplete={onExitComplete}>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 4 }}
          transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
          className={className}
          style={style}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ────────────────────── Backdrop (modal overlay) ────────────────────── */

interface BackdropProps {
  isOpen: boolean;
  onClick?: () => void;
  className?: string;
}

export function Backdrop({ isOpen, onClick, className = '' }: BackdropProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className={className}
          onClick={onClick}
        />
      )}
    </AnimatePresence>
  );
}

/* ────────────────────── Exports ────────────────────── */

export { staggerContainer, staggerItemVariants, staggerRowVariants };
export { EASE_OUT_EXPO, EASE_OUT, BASE_DURATION, STAGGER_INTERVAL };
