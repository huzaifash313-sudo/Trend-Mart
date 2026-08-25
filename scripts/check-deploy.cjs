const base = "https://trend-marts.vercel.app";

async function main() {
  const html = await (await fetch(base + "/products")).text();
  // find JS chunk urls
  const chunks = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
  const chunkList = [];
  for (const c of chunks.slice(0, 12)) chunkList.push(c);
  console.log("chunks:", chunkList.join("\n"));

  let found = null;
  for (const c of chunkList.slice(0, 8)) {
    try {
      const js = await (await fetch(new URL(c, base))).text();
      const m = js.match(/sb_publishable_[A-Za-z0-9_]+/) || js.match(/sbp_[A-Za-z0-9]{40,}/);
      if (m) {
        found = { chunk: c, key: m[0] };
        break;
      }
      const urlMatch = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/);
      if (urlMatch && !found) found = { chunk: c, url: urlMatch[0] };
    } catch {}
  }
  console.log("\nFOUND:", JSON.stringify(found));
}
main().catch((e) => console.log("ERR", e.message));
