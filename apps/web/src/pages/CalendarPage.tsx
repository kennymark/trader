import { useQuery } from "@tanstack/react-query";
import { CacheNotice } from "../components/CacheNotice";
import { fetchIntelligence } from "../lib/queries";
import { CatalystCalendar } from "./IntelligencePage";

/**
 * Dated events are a diary, not a property of whichever stock is selected, so
 * the calendar gets the whole width rather than a tab beside the chart.
 */
export function CalendarPage() {
  const hunt = useQuery({
    queryKey: ["intelligence", "watchlist"],
    queryFn: () => fetchIntelligence(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  return (
    <div className="page">
      <CacheNotice updatedAt={hunt.dataUpdatedAt} refreshing={hunt.isFetching} />

      {hunt.isPending && <p className="muted">Scoring your list…</p>}
      {/* A failed refresh with dates already on hand still has something to show. */}
      {hunt.isError && !hunt.data && <p className="muted">Couldn’t load the calendar.</p>}
      {hunt.data && <CatalystCalendar items={hunt.data.catalysts} />}
    </div>
  );
}
