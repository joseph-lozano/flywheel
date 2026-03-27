/**
 * Cleans auto-generated GitHub release notes.
 * - Keeps only feat: and fix: entries
 * - Strips "by @user" author references
 * - Strips PR links (private repo)
 * - Preserves the "## What's Changed" header
 *
 * Usage: gh release view TAG --json body -q .body | node scripts/clean-release-notes.js
 */

const KEEP_PREFIXES = ["* feat:", "* fix:"];

function cleanReleaseNotes(input) {
  const lines = input.split("\n");
  const kept = lines.filter((line) => KEEP_PREFIXES.some((prefix) => line.startsWith(prefix)));
  const cleaned = kept.map((line) =>
    line
      .replace(/ by @\S+/g, "")
      .replace(/ in https:\/\/\S+/g, "")
      .replace(/ \(#\d+\)/g, ""),
  );

  if (cleaned.length === 0) return "";
  return `## What's Changed\n\n${cleaned.join("\n")}\n`;
}

if (require.main === module) {
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => {
    process.stdout.write(cleanReleaseNotes(input));
  });
}

module.exports = { cleanReleaseNotes };
