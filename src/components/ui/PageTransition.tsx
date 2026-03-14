import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useOutlet } from 'react-router-dom';

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/**
 * Captures the outlet element at mount time and freezes it.
 * When AnimatePresence plays the exit animation on the OLD wrapper,
 * this component still renders the old route's content (not the new one).
 */
function FrozenOutlet() {
  const outlet = useOutlet();
  const [frozen] = useState(outlet);
  return frozen;
}

export function PageTransition() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{
          duration: 0.35,
          ease: EASE_OUT_EXPO,
        }}
      >
        <FrozenOutlet />
      </motion.div>
    </AnimatePresence>
  );
}
