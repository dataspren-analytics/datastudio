import { useEffect, useRef, useState } from "react";

/**
 * Acquire an exclusive Web Lock so only one tab can use OPFS at a time.
 * Returns `{ tabBlocked }` — true when another tab holds the lock.
 */
export function useWebLock(lockName: string) {
  const [tabBlocked, setTabBlocked] = useState(false);
  const releaseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let released = false;

    navigator.locks.request(
      lockName,
      { ifAvailable: true },
      (lock) => {
        if (released) return;
        if (!lock) {
          setTabBlocked(true);
          return;
        }
        setTabBlocked(false);
        return new Promise<void>((resolve) => {
          releaseRef.current = resolve;
        });
      },
    );

    return () => {
      released = true;
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, [lockName]);

  return { tabBlocked };
}
