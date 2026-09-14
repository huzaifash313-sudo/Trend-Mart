import fs from "fs";
const s = fs.readFileSync("lib/i18n/dictionaries.ts", "utf8");
const enMatch = s.match(/const en: Dict = \{([\s\S]*?)\n\};/);
const urMatch = s.match(/const ur: Dict = \{([\s\S]*?)\n\};/);
function keys(block) {
  return [...block.matchAll(/"([^"]+)":/g)].map((m) => m[1]);
}
const en = new Set(keys(enMatch[1]));
const ur = new Set(keys(urMatch[1]));
console.log("en", en.size, "ur", ur.size);
console.log("missingInUr", [...en].filter((k) => !ur.has(k)));
console.log("missingInEn", [...ur].filter((k) => !en.has(k)));
