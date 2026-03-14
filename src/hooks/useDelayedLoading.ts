import { useState, useEffect } from 'react';

/**
 * Suppresses the loading indicator for a short grace period.
 * If data arrives within the delay (e.g. during a page transition fade-in),
 * skeletons are never shown. Only returns true if loading persists past the delay.
 */
export function useDelayedLoading(isLoading: boolean, delayMs = 300): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [isLoading, delayMs]);

  return isLoading && show;
}
