import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Server snapshot is `true`: assume connected until the browser says otherwise. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
