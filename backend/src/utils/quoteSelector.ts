/**
 * Quote selection utilities for the Colleague Voice Bot.
 *
 * Implements a sliding-window non-repetition strategy: a quote that appeared
 * in the last 5 requests for a given colleague will not be selected again
 * until it has aged out of the window.
 */

export interface Quote {
  quoteId: string;
  text: string;
  category: string;
  addedAt: string;
}

const RECENT_WINDOW_SIZE = 5;

/**
 * Selects a quote that was not used in the last 5 requests for this colleague.
 *
 * @param allQuotes      The full quote library.
 * @param recentQuoteIds Sliding window of up to 5 recent quoteIds for this colleague.
 * @returns              A randomly selected quote not in the recent window.
 *                       Falls back to a random quote from the full library if all
 *                       quotes are in the recent window (edge case with tiny libraries).
 */
export function selectQuote(allQuotes: Quote[], recentQuoteIds: string[]): Quote {
  if (allQuotes.length === 0) {
    throw new Error('Quote library is empty');
  }

  const recentSet = new Set(recentQuoteIds);
  const candidates = allQuotes.filter((q) => !recentSet.has(q.quoteId));

  // Fall back to full library if every quote is in the recent window
  const pool = candidates.length > 0 ? candidates : allQuotes;

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

/**
 * Returns an updated recentQuoteIds array after adding a new quoteId.
 * The array is capped at RECENT_WINDOW_SIZE (5) items; the oldest entry is
 * dropped when the cap is exceeded.
 *
 * @param recentQuoteIds Current sliding window (0–5 items).
 * @param newQuoteId     The quoteId that was just used.
 * @returns              Updated window with newQuoteId appended and oldest dropped if needed.
 */
export function updateRecentQuotes(recentQuoteIds: string[], newQuoteId: string): string[] {
  const updated = [...recentQuoteIds, newQuoteId];
  if (updated.length > RECENT_WINDOW_SIZE) {
    return updated.slice(updated.length - RECENT_WINDOW_SIZE);
  }
  return updated;
}
