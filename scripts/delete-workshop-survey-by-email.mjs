#!/usr/bin/env node
/**
 * Delete workshop survey row(s) by email on the deployed site.
 * Usage: ADMIN_PASSWORD=... node scripts/delete-workshop-survey-by-email.mjs user@example.com
 */
const baseUrl = (process.env.APP_URL || "https://apcse-web.onrender.com").replace(/\/$/, "");
const adminPassword = process.env.ADMIN_PASSWORD?.trim();
const email = process.argv[2]?.trim().toLowerCase();

if (!adminPassword) {
  console.error("Set ADMIN_PASSWORD.");
  process.exit(1);
}
if (!email) {
  console.error("Usage: node scripts/delete-workshop-survey-by-email.mjs <email>");
  process.exit(1);
}

const headers = { "x-admin-password": adminPassword };

const listRes = await fetch(`${baseUrl}/api/admin/workshop-surveys`, { headers });
const listText = await listRes.text();
let listData;
try {
  listData = JSON.parse(listText);
} catch {
  console.error("List failed:", listRes.status, listText.slice(0, 200));
  process.exit(1);
}
if (!listRes.ok) {
  console.error(listData.error || listRes.status);
  process.exit(1);
}

const matches = (listData.surveys || []).filter(
  (row) => String(row.email || "").trim().toLowerCase() === email,
);
if (!matches.length) {
  console.log(`No workshop survey found for ${email}.`);
  process.exit(0);
}

for (const row of matches) {
  const delRes = await fetch(`${baseUrl}/api/admin/workshop-surveys/${row.id}`, {
    method: "DELETE",
    headers,
  });
  const delData = await delRes.json().catch(() => ({}));
  if (!delRes.ok) {
    console.error(`Delete ${row.id} failed:`, delData.error || delRes.status);
    process.exit(1);
  }
  console.log(`Deleted: ${row.name} (${row.id})`);
}
