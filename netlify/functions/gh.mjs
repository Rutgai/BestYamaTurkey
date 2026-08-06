/* ============================================================
   MiceYama — Netlify Function (yönetim proxy'si)
   GitHub erişim jetonu Netlify ortam değişkeninde saklanır:
   Ayarlar → Environment variables → GITHUB_TOKEN
   İstemci bu function üzerinden okur/yazar; jeton tarayıcıya hiç inmez.
   ============================================================ */
export default async (req) => {
  const OWNER = "Rutgai";
  const REPO = "BestYamaTurkey";
  const token = process.env.GITHUB_TOKEN;
  const base = "https://api.github.com/repos/" + OWNER + "/" + REPO;
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };
  const url = new URL(req.url);

  const json = (obj, status) =>
    new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

  try {
    if (req.method === "GET") {
      // check=1 -> depoya erişim var mı? (jeton geçerli / izinli mi)
      if (url.searchParams.get("check") === "1") {
        const r = await fetch(base, { headers });
        return json(await r.json(), r.status);
      }
      const path = url.searchParams.get("path") || "data/site-data.json";
      const r = await fetch(base + "/contents/" + path, { headers });
      return json(await r.json(), r.status);
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { path, message, contentBase64 } = body || {};
      if (!path || !message || !contentBase64) {
        return json({ error: "eksik alan" }, 400);
      }
      // Var olan dosyada güncelleme için sha gereklidir.
      const payload = { message: message, content: contentBase64 };
      const ex = await fetch(base + "/contents/" + path, { headers });
      if (ex.status === 200) {
        const ej = await ex.json();
        if (ej.sha) payload.sha = ej.sha;
      }
      const r = await fetch(base + "/contents/" + path, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return json(await r.json(), r.status);
    }

    return json({ error: "metod desteklenmiyor" }, 405);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
};
