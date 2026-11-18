import { useEffect } from 'react';

/**
 * Hook for client-side security and session hygiene.
 * Does not block standard user interactions (context menu, copy/paste, or browser DevTools).
 */
export const useSecurity = () => {
  useEffect(() => {
    // Reserved for non-intrusive security telemetry if needed.
  }, []);
};
