/**
 * Web Search Service
 * Provides real-time information search capability
 */

/**
 * Search the web using DuckDuckGo HTML search (more reliable for Japanese)
 * @param {string} query - Search query
 * @returns {Promise<Object>} Search results
 */
export async function searchWeb(query) {
  try {
    // Use DuckDuckGo HTML search which works better for Japanese
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ja,en;q=0.9",
      },
    });

    const html = await response.text();
    const results = [];

    // Extract search results using regex - DuckDuckGo HTML structure
    // Each result is in a div with class "result results_links results_links_deep web-result"
    const resultBlocks = html.split(/class="result\s+results_links/);

    for (let i = 1; i < Math.min(6, resultBlocks.length); i++) {
      const block = resultBlocks[i];

      // Extract title from result__a
      const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
      // Extract URL from result__url
      const urlMatch = block.match(/class="result__url"[^>]*href="([^"]+)"/);
      // Extract snippet from result__snippet
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([^<]+(?:<b>[^<]*<\/b>[^<]*)*)/);

      if (titleMatch) {
        const title = titleMatch[1].trim();
        let snippet = "";
        if (snippetMatch) {
          // Clean up the snippet - remove HTML tags
          snippet = snippetMatch[1].replace(/<[^>]*>/g, '').trim();
        }
        let url = "";
        if (urlMatch) {
          url = urlMatch[1];
          // Decode DuckDuckGo redirect URL
          if (url.includes("uddg=")) {
            const decoded = url.match(/uddg=([^&]+)/);
            if (decoded) {
              url = decodeURIComponent(decoded[1]);
            }
          }
        }

        if (title && snippet) {
          results.push({
            type: "web",
            title: title,
            content: snippet,
            url: url,
          });
        }
      }
    }

    // If still no results, try with English translation hint
    if (results.length === 0) {
      console.log("No results from HTML search, trying alternative...");
      // Add a note that search returned no results
      results.push({
        type: "note",
        content: `「${query}」の検索結果を取得できませんでした。`,
      });
    }

    return {
      success: results.length > 0 && results[0].type !== "note",
      query,
      results,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Search error:", error);
    return {
      success: false,
      query,
      error: error.message,
      results: [],
    };
  }
}

/**
 * Get current date and time information
 * @returns {Object} Current date/time info
 */
export function getCurrentDateTime() {
  const now = new Date();
  const options = {
    timeZone: 'Asia/Tokyo',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  const japaneseDate = now.toLocaleDateString('ja-JP', options);
  const dayOfWeek = now.toLocaleDateString('ja-JP', { weekday: 'long', timeZone: 'Asia/Tokyo' });

  return {
    fullDate: japaneseDate,
    dayOfWeek,
    year: now.toLocaleDateString('ja-JP', { year: 'numeric', timeZone: 'Asia/Tokyo' }),
    month: now.toLocaleDateString('ja-JP', { month: 'long', timeZone: 'Asia/Tokyo' }),
    day: now.toLocaleDateString('ja-JP', { day: 'numeric', timeZone: 'Asia/Tokyo' }),
    time: now.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }),
    iso: now.toISOString(),
  };
}

/**
 * Format search results for AI context
 * @param {Object} searchResult - Search result from searchWeb
 * @returns {string} Formatted string for AI
 */
export function formatSearchResultsForAI(searchResult) {
  if (!searchResult.success || searchResult.results.length === 0) {
    return `検索「${searchResult.query}」: 結果が見つかりませんでした。`;
  }

  let formatted = `「${searchResult.query}」の検索結果:\n\n`;

  searchResult.results.forEach((result, index) => {
    if (result.type === "web") {
      formatted += `${index + 1}. ${result.title}\n`;
      formatted += `   ${result.content}\n\n`;
    } else if (result.type === "answer") {
      formatted += `【回答】${result.content}\n`;
      if (result.source) {
        formatted += `出典: ${result.source}\n`;
      }
      formatted += "\n";
    }
  });

  return formatted;
}
