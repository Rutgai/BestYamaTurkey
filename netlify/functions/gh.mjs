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
      // img=path -> görseli doğrudan bayt olarak döndür (Content-Type ile)
      const imgPath = url.searchParams.get("img");
      if (imgPath) {
        const r = await fetch(base + "/contents/" + imgPath, { headers });
        const j = await r.json();
        if (!j.content) {
          return json({ error: "gorsel bulunamadi", message: j && j.message }, r.status === 200 ? 500 : r.status);
        }
        const ext = (imgPath.split(".").pop() || "png").toLowerCase();
        const mime =
          ext === "png" ? "image/png" :
          ext === "webp" ? "image/webp" :
          ext === "gif" ? "image/gif" :
          ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "application/octet-stream";
        const b64 = String(j.content).replace(/\s+/g, "");
        const bin = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
        return new Response(bin, {
          status: 200,
          headers: { "Content-Type": mime, "Cache-Control": "public, max-age=3600" }
        });
      }
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
