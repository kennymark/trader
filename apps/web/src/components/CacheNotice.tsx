import { formatDateTime } from "../lib/dates";
import { useOnline } from "../lib/online";

type Props = {
  /** `dataUpdatedAt` from the query backing this surface. 0 means never fetched. */
  updatedAt: number;
  /** True while a refetch is in flight, so the notice does not contradict it. */
  refreshing?: boolean;
};

/**
 * Says when the figures on screen were last true. It only appears when the
 * browser is offline or the last fetch failed, because a number with no caveat
 * is read as current — and on this surface that would be a lie.
 */
export function CacheNotice({ updatedAt, refreshing }: Props) {
  const online = useOnline();
  if (online || !updatedAt || refreshing) return null;

  return (
    <p className="cache-notice" role="status">
      Offline. Showing the last figures fetched, from{" "}
      {formatDateTime(new Date(updatedAt).toISOString())}.
    </p>
  );
}
