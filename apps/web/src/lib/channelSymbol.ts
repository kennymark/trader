/** True when a channel's symbol matches the given ticker (case-insensitive). */
export function channelMatchesSymbol(
  channelSymbol: string | null | undefined,
  symbol: string,
) {
  return (channelSymbol || "").toUpperCase() === symbol.toUpperCase();
}
