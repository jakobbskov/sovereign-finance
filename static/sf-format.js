/*
  Sovereign Finance shared formatting helpers.

  Kept as classic script globals for compatibility with the existing
  non-module frontend. This file intentionally contains pure helpers only.
*/

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#39;"
  }[c]));
}

function fmt(n){
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return Number(n).toLocaleString("da-DK", { maximumFractionDigits: 2 });
}
