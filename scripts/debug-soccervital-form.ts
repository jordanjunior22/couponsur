// scripts/debug-soccervital-form.ts
//
// Run with: npx tsx scripts/debug-soccervital-form.ts
//
// This fetches one league's table page and prints out every <table> found
// on the page, along with any heading text nearby, so we can see the REAL
// structure and fix lib/soccervitalForm.ts's selectors against real HTML
// instead of guessing.

import * as cheerio from "cheerio";

async function main() {
  const url = "https://www.soccervital.com/table-china-super-league-soccer-results-and-prediction.html";

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  console.log("Status:", res.status);
  const html = await res.text();
  console.log("HTML length:", html.length);

  const $ = cheerio.load(html);

  console.log("\n=== All headings (h1-h4) ===");
  $("h1, h2, h3, h4").each((i, el) => {
    console.log(`[${i}] <${el.tagName}> "${$(el).text().trim()}"`);
  });

  console.log("\n=== All tables found (first 3 rows of each) ===");
  $("table").each((tIdx, table) => {
    console.log(`\n--- Table #${tIdx} ---`);
    const rows = $(table).find("tr").slice(0, 3);
    rows.each((rIdx, row) => {
      const cells = $(row).find("td, th").map((_, c) => $(c).text().trim()).get();
      console.log(`  row ${rIdx}:`, cells);
    });
  });
}

main().catch(console.error);