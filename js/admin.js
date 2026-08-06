/* ============================================================
   MiceYama — Yönetim paneli mantığı
   Verileri GitHub deposundaki data/site-data.json üzerinden
   /.netlify/functions/gh fonksiyonu ile okur/yazar.
   GitHub jetonu Netlify ortam değişkeninde (GITHUB_TOKEN) saklanır.
   ============================================================ */
(function () {
  "use strict";

  var OWNER = "Rutgai";
  var REPO = "BestYamaTurkey";
  var BRANCH = "main";
  var DATA_PATH = "data/site-data.json";
  var FN = "/.netlify/functions/gh";

  var DEFAULT_DATA = {
    settings: {
      siteName: "MiceYama",
      tagline: "Türkçe oyun yama arşivi",
      heroBadge: "Türkçe Yama Arşivi",
      heroTitle: "Tüm oyunlarınız, Türkçe.",
      heroSub: "MiceYama, en sevdiğiniz oyunlar için profesyonel Türkçe çeviri yamaları üretir.",
      email: "destek@miceyama.com",
      emailNote: "En geç 24 saat içinde dönüş yapıyoruz.",
      footerNote: "© 2026 MiceYama. Tüm hakları saklıdır."
    },
    categories: [],
    download: { enabled: false, version: "", size: "", url: "", note: "Yakında sunulacaktır." },
    games: [],
    faq: [],
    announcements: [],
    announcementCategories: [],
    posts: [],
    socials: []
  };

  var data = null;

  /* --------------------------------------------------------
     Yardımcılar
     -------------------------------------------------------- */
  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function b64encodeUtf8(s) {
    var bytes = new TextEncoder().encode(s);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin);
  }

  function b64decodeUtf8(b64) {
    var bin = atob(String(b64).replace(/\s+/g, ""));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  /* --------------------------------------------------------
     GitHub istekleri — Netlify fonksiyonu üzerinden.
     Jeton istemcide yok; fonksiyon GITHUB_TOKEN ortam değişkenini kullanır.
     -------------------------------------------------------- */

  function makeGhError(status, message) {
    var e = new Error(message || "HTTP " + status);
    e.status = status;
    return e;
  }

  function parseRes(r) {
    return r.json().then(function (j) {
      if (!r.ok) {
        throw makeGhError(r.status, (j && j.message) || ("HTTP " + r.status));
      }
      return j;
    });
  }

  function ghGet(path) {
    return fetch(FN + "?path=" + encodeURIComponent(path), {
      headers: { Accept: "application/json" }
    }).then(parseRes);
  }

  function ghCheck() {
    return fetch(FN + "?check=1", {
      headers: { Accept: "application/json" }
    }).then(parseRes);
  }

  function ghPut(path, message, contentBase64) {
    return fetch(FN, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ path: path, message: message, contentBase64: contentBase64 })
    }).then(parseRes);
  }

  /* --------------------------------------------------------
     Hata açıklaması
     -------------------------------------------------------- */
  function hintFor(err) {
    var m = String((err && err.message) || err);
    if (/bad credentials|token was revoked|token has expired|401/i.test(m)) {
      return "GitHub jetonu geçersiz veya Netlify'da GITHUB_TOKEN ortam değişkeni eksik/hatalı. Netlify → Environment variables bölümünü kontrol edip siteyi yeniden dağıtın.";
    }
    if (/not found|404/i.test(m)) {
      return "Depoya erişilemiyor. Jetonun BestYamaTurkey deposuna (Contents → Read and write) izni olduğundan emin olun.";
    }
    if (/rate limit/i.test(m)) {
      return "GitHub istek sınırına ulaşıldı. Birkaç dakika sonra tekrar deneyin.";
    }
    if (/insufficient scopes/i.test(m)) {
      return "Jetonun yetkisi yetersiz. Contents izni (Read and write) gerekli.";
    }
    if (/content was truncated/i.test(m)) {
      return "Dosya GitHub API limitinden büyük (100 MB). GitHub Release'e yükleyip bağlantı verin.";
    }
    if (/TypeError|Failed to fetch/i.test(m)) {
      return "Fonksiyon çağrılamadı. Sitenin Netlify'a dağıtıldığından ve /.netlify/functions/gh yolunun çalıştığından emin olun.";
    }
    return m;
  }

  /* --------------------------------------------------------
     Veri yükleme / kaydetme
     -------------------------------------------------------- */
  function loadData() {
    return ghGet(DATA_PATH).then(function (gh) {
      data = JSON.parse(b64decodeUtf8(gh.content));
    }).catch(function (err) {
      if (err.status === 404) {
        // Dosya gerçekten yok mu, yoksa jeton erişemiyor mu?
        return ghCheck().then(function () {
          data = clone(DEFAULT_DATA);
        }).catch(function (e2) {
          throw makeGhError(e2.status || 403, (e2 && e2.message) || "Depoya erişilemedi.");
        });
      }
      throw err;
    });
  }

  function saveData() {
    var b64 = b64encodeUtf8(JSON.stringify(data, null, 2));
    return ghPut(DATA_PATH, "Admin: site verisi güncellendi", b64);
  }

  /* --------------------------------------------------------
     Bağlantı kontrolü — fonksiyon depoya erişebiliyor mu?
     -------------------------------------------------------- */
  function checkAccess() {
    return ghCheck().then(function (repo) {
      if (repo && repo.full_name) return;
      throw makeGhError(403, "Depoya erişilemedi");
    });
  }

  /* --------------------------------------------------------
     Giriş / çıkış
     -------------------------------------------------------- */
  function showLogin() {
    $("loginView").classList.remove("a-hide");
    $("panelView").classList.add("a-hide");
    $("logoutBtn").classList.add("a-hide");
  }

  function showPanel() {
    $("loginView").classList.add("a-hide");
    $("panelView").classList.remove("a-hide");
    $("logoutBtn").classList.remove("a-hide");
    $("connStatus").textContent = OWNER + "/" + REPO + " — bağlı";
    $("connStatus").classList.add("ok");
  }

  function setStatus(msg, ok) {
    var s = $("saveStatus");
    s.textContent = msg;
    s.className = "a-save-status " + (ok ? "ok" : "bad");
  }

  /* --------------------------------------------------------
     Sekmeler
     -------------------------------------------------------- */
  function initTabs() {
    var tabs = $("tabs");
    tabs.addEventListener("click", function (e) {
      var btn = e.target.closest(".a-tab");
      if (!btn) return;
      var name = btn.getAttribute("data-tab");
      tabs.querySelectorAll(".a-tab").forEach(function (t) {
        t.classList.toggle("is-active", t === btn);
      });
      document.querySelectorAll(".a-tabpane").forEach(function (p) {
        p.classList.toggle("is-active", p.getAttribute("data-pane") === name);
      });
    });
  }

  /* --------------------------------------------------------
     Form alanı yardımcıları
     -------------------------------------------------------- */
  function fieldInput(id, label, value, type) {
    var wrap = el("label", "a-field");
    wrap.appendChild(el("span", "", label));
    var input = el("input", "");
    input.type = type || "text";
    input.id = id;
    input.value = value == null ? "" : value;
    wrap.appendChild(input);
    return wrap;
  }

  function fieldSelect(id, label, value, options) {
    var wrap = el("label", "a-field");
    wrap.appendChild(el("span", "", label));
    var sel = el("select", "");
    sel.id = id;
    Object.keys(options).forEach(function (key) {
      var o = el("option", "", options[key]);
      o.value = key;
      if (key === value) o.selected = true;
      sel.appendChild(o);
    });
    wrap.appendChild(sel);
    return wrap;
  }

  function fieldTextarea(id, label, value) {
    var wrap = el("label", "a-field");
    wrap.appendChild(el("span", "", label));
    var ta = el("textarea", "");
    ta.id = id;
    ta.rows = 3;
    ta.textContent = value == null ? "" : value;
    wrap.appendChild(ta);
    return wrap;
  }

  function fieldCheckbox(id, label, checked) {
    var wrap = el("label", "a-field");
    wrap.appendChild(el("span", "", label));
    var input = el("input", "");
    input.type = "checkbox";
    input.id = id;
    input.checked = !!checked;
    wrap.appendChild(input);
    return wrap;
  }

  /* --------------------------------------------------------
     Oyun editörü
     -------------------------------------------------------- */
  function renderGamesEditor() {
    var box = $("gamesEditor");
    box.innerHTML = "";
    if (data.games.length === 0) {
      box.appendChild(el("p", "a-empty", "Henüz oyun yok. '+ Yeni Oyun' ile ekleyin."));
      return;
    }
    data.games.forEach(function (g, i) {
      box.appendChild(gameRow(g, i));
    });
  }

  function gameRow(g, i) {
    var row = el("div", "a-row-card");
    var head = el("div", "a-row-card-head");
    var title = el("strong", "", (g.name || "Oyun") + (g.year ? " (" + g.year + ")" : ""));
    var del = el("button", "a-del", "Sil");
    del.type = "button";
    del.addEventListener("click", function () {
      data.games.splice(i, 1);
      renderGamesEditor();
    });
    head.appendChild(title);
    head.appendChild(del);
    row.appendChild(head);

    var hid = el("input", "");
    hid.type = "hidden";
    hid.id = "gid-" + i;
    hid.value = g.id || ("g" + Date.now().toString(36) + "-" + i);
    row.appendChild(hid);

    var inline = el("div", "a-inline");
    inline.appendChild(fieldInput("gname-" + i, "Ad", g.name));
    inline.appendChild(fieldInput("gyear-" + i, "Yıl", g.year));
    inline.appendChild(fieldSelect("gstatus-" + i, "Durum", g.status,
      { yayinda: "Yayında", yapim: "Yapım Aşamasında" }));
    inline.appendChild(fieldSelect("gcat-" + i, "Kategori", g.category || "", categoryOptions()));
    inline.appendChild(fieldInput("gbadge-" + i, "Rozet", g.badge));
    inline.appendChild(fieldSelect("gtone-" + i, "Kart tonu", g.tone,
      { indigo: "İndigo", violet: "Mor", pink: "Pembe", emerald: "Yeşil", amber: "Turuncu", sky: "Mavi" }));
    inline.appendChild(fieldInput("gprogress-" + i, "İlerleme %", g.progress != null ? g.progress : "", "number"));
    row.appendChild(inline);

    row.appendChild(fieldCheckbox("gdownload-" + i, "İndirilebilir (yayındaysa buton gösterilir)", g.download));
    row.appendChild(fieldInput("gdlurl-" + i, "Oyuna özel indirme bağlantısı (boşsa genel bağlantı kullanılır)", g.downloadUrl || ""));
    row.appendChild(fieldTextarea("gdesc-" + i, "Açıklama", g.desc));
    row.appendChild(fieldInput("gtags-" + i, "Etiketler (virgülle)", (g.tags || []).join(", ")));
    row.appendChild(buildImageField(i, g));
    return row;
  }

  function imgAdminUrl(path) {
    return path ? FN + "?img=" + encodeURIComponent(path) : "";
  }

  function buildImageField(i, g) {
    var wrap = el("div", "a-field a-image-field");
    wrap.appendChild(el("span", "", "Oyun Görseli (kartta 9:16 otomatik kırpılır, tıklayınca tam hali açılır)"));

    var preview = el("div", "a-image-preview");
    var src = "";
    var pi = pendingImages[i];
    if (pi && pi.dataUrl) src = pi.dataUrl;
    else if (g.image) src = imgAdminUrl(g.image);
    if (src) {
      var img = el("img", "");
      img.src = src;
      img.alt = "Önizleme";
      preview.appendChild(img);
    } else {
      preview.appendChild(el("span", "a-image-empty", "Görsel yok — kart gradient arka plan gösterir"));
    }
    wrap.appendChild(preview);

    var bar = el("div", "a-inline a-image-actions");
    var lbl = el("label", "a-btn a-btn-outline");
    lbl.appendChild(el("span", "", src ? "Görseli Değiştir" : "Görsel Yükle"));
    var file = el("input", "a-file");
    file.type = "file";
    file.accept = "image/png,image/jpeg,image/webp,image/gif";
    file.addEventListener("change", function () {
      if (file.files && file.files[0]) pickImage(i, file.files[0]);
      file.value = "";
    });
    lbl.appendChild(file);
    bar.appendChild(lbl);
    if (src) {
      var remove = el("button", "a-btn a-btn-danger", "Görseli Kaldır");
      remove.type = "button";
      remove.addEventListener("click", function () {
        delete pendingImages[i];
        data.games[i].image = "";
        data.games[i].imageCard = "";
        renderGamesEditor();
      });
      bar.appendChild(remove);
    }
    wrap.appendChild(bar);
    return wrap;
  }

  function categoryOptions() {
    var sel = {};
    sel[""] = "— Seçin —";
    (data.categories || []).forEach(function (c) {
      sel[c.id] = c.name;
    });
    return sel;
  }

  function collectGames() {
    var list = [];
    document.querySelectorAll("#gamesEditor .a-row-card").forEach(function (row, i) {
      var progress = $("gprogress-" + i).value.trim();
      var status = $("gstatus-" + i).value;
      var prev = data.games[i] || {};
      var gid = $("gid-" + i) ? $("gid-" + i).value : "";
      list.push({
        id: gid || ("g" + Date.now().toString(36) + "-" + i),
        name: $("gname-" + i).value.trim(),
        year: $("gyear-" + i).value.trim(),
        category: $("gcat-" + i).value,
        badge: $("gbadge-" + i).value.trim(),
        status: status,
        progress: status === "yapim" && progress !== "" ? Number(progress) : null,
        tone: $("gtone-" + i).value,
        download: $("gdownload-" + i).checked,
        downloadUrl: $("gdlurl-" + i).value.trim(),
        desc: $("gdesc-" + i).value.trim(),
        tags: $("gtags-" + i).value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
        image: prev.image || "",
        imageCard: prev.imageCard || ""
      });
    });
    return list;
  }

  /* --------------------------------------------------------
     Görsel yükleme (kırpmasız — kart 9:16 otomatik kırpar)
     -------------------------------------------------------- */
  var pendingImages = {};

  function pickImage(i, file) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var b64 = shrinkImage(img);
        pendingImages[i] = { b64: b64, dataUrl: "data:image/jpeg;base64," + b64 };
        renderGamesEditor();
        setStatus("Görsel hazır. 'Değişiklikleri Kaydet' ile yüklenecek.", false);
      };
      img.onerror = function () {
        setStatus("Görsel okunamadı: " + file.name, false);
      };
      img.src = reader.result;
    };
    reader.onerror = function () { setStatus("Dosya okunamadı.", false); };
    reader.readAsDataURL(file);
  }

  function shrinkImage(img) {
    var maxW = 1600;
    var scale = Math.min(1, maxW / img.naturalWidth);
    var w = Math.max(1, Math.round(img.naturalWidth * scale));
    var h = Math.max(1, Math.round(img.naturalHeight * scale));
    var cvs = document.createElement("canvas");
    cvs.width = w; cvs.height = h;
    cvs.getContext("2d").drawImage(img, 0, 0, w, h);
    var quality = 0.85;
    var b64 = cvs.toDataURL("image/jpeg", quality).split(",")[1];
    while (b64.length > 900000 && quality > 0.5) {
      quality -= 0.1;
      b64 = cvs.toDataURL("image/jpeg", quality).split(",")[1];
    }
    return b64;
  }

  function uploadPendingImages(games) {
    var uploads = [];
    games.forEach(function (g, i) {
      var pi = pendingImages[i];
      if (!pi) return;
      var path = "data/images/" + g.id + "-" + i + ".jpg";
      uploads.push(
        ghPut(path, "Oyun görseli: " + (g.name || g.id), pi.b64)
          .then(function () { g.image = path; g.imageCard = path; })
      );
    });
    return Promise.all(uploads);
  }

  /* --------------------------------------------------------
     Duyuru editörü
     -------------------------------------------------------- */
  function announcementCategoryOptions() {
    var sel = {};
    sel[""] = "— Seçin —";
    (data.announcementCategories || []).forEach(function (c) {
      sel[c.id] = c.name;
    });
    return sel;
  }

  function renderAnnounceEditor() {
    var box = $("announceEditor");
    box.innerHTML = "";
    if (!data.announcements || data.announcements.length === 0) {
      box.appendChild(el("p", "a-empty", "Henüz duyuru yok. '+ Yeni Duyuru' ile ekleyin."));
      return;
    }
    data.announcements.forEach(function (a, i) {
      var row = el("div", "a-row-card");
      var head = el("div", "a-row-card-head");
      head.appendChild(el("strong", "", "Duyuru " + (i + 1)));
      var del = el("button", "a-del", "Sil");
      del.type = "button";
      del.addEventListener("click", function () {
        data.announcements.splice(i, 1);
        renderAnnounceEditor();
      });
      head.appendChild(del);
      row.appendChild(head);
      var grid = el("div", "a-grid");
      grid.appendChild(fieldInput("adate-" + i, "Tarih (örn. 05.08.2026)", a.date));
      grid.appendChild(fieldInput("atitle-" + i, "Başlık", a.title));
      grid.appendChild(fieldSelect("acat-" + i, "Kategori", a.category || "", announcementCategoryOptions()));
      row.appendChild(grid);
      row.appendChild(fieldTextarea("abody-" + i, "İçerik", a.body));
      box.appendChild(row);
    });
  }

  function collectAnnouncements() {
    var list = [];
    document.querySelectorAll("#announceEditor .a-row-card").forEach(function (row, i) {
      list.push({
        date: $("adate-" + i).value.trim(),
        title: $("atitle-" + i).value.trim(),
        category: $("acat-" + i).value,
        body: $("abody-" + i).value.trim()
      });
    });
    return list;
  }

  /* --------------------------------------------------------
     Duyuru kategorisi editörü
     -------------------------------------------------------- */
  function renderAnnounceCatsEditor() {
    var box = $("announceCatsEditor");
    box.innerHTML = "";
    if (!data.announcementCategories || data.announcementCategories.length === 0) {
      box.appendChild(el("p", "a-empty", "Henüz duyuru kategorisi yok. '+ Yeni Kategori' ile ekleyin."));
      return;
    }
    data.announcementCategories.forEach(function (c, i) {
      var row = el("div", "a-row-card");
      var head = el("div", "a-row-card-head");
      head.appendChild(el("strong", "", "Kategori " + (i + 1)));
      var del = el("button", "a-del", "Sil");
      del.type = "button";
      del.addEventListener("click", function () {
        var removedId = data.announcementCategories[i].id;
        data.announcementCategories.splice(i, 1);
        (data.announcements || []).forEach(function (a) {
          if (a.category === removedId) a.category = "";
        });
        renderAnnounceCatsEditor();
        renderAnnounceEditor();
      });
      head.appendChild(del);
      row.appendChild(head);
      var grid = el("div", "a-grid");
      grid.appendChild(fieldInput("acid-" + i, "Kimlik (boşluk yok, örn. guncelleme)", c.id));
      grid.appendChild(fieldInput("acname-" + i, "Ad (örn. Güncelleme)", c.name));
      row.appendChild(grid);
      box.appendChild(row);
    });
  }

  function collectAnnouncementCategories() {
    var list = [];
    document.querySelectorAll("#announceCatsEditor .a-row-card").forEach(function (row, i) {
      var id = $("acid-" + i).value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      var name = $("acname-" + i).value.trim();
      if (!id) id = "kategori-" + i;
      if (!name) name = "Kategori " + (i + 1);
      list.push({ id: id, name: name });
    });
    return list;
  }

  /* --------------------------------------------------------
     Blog yazısı editörü
     -------------------------------------------------------- */
  function renderPostsEditor() {
    var box = $("postsEditor");
    box.innerHTML = "";
    if (!data.posts || data.posts.length === 0) {
      box.appendChild(el("p", "a-empty", "Henüz yazı yok. '+ Yeni Yazı' ile ekleyin."));
      return;
    }
    data.posts.forEach(function (p, i) {
      var row = el("div", "a-row-card");
      var head = el("div", "a-row-card-head");
      head.appendChild(el("strong", "", "Yazı " + (i + 1)));
      var del = el("button", "a-del", "Sil");
      del.type = "button";
      del.addEventListener("click", function () {
        data.posts.splice(i, 1);
        renderPostsEditor();
      });
      head.appendChild(del);
      row.appendChild(head);
      var grid = el("div", "a-grid");
      grid.appendChild(fieldInput("pdate-" + i, "Tarih (örn. 05.08.2026)", p.date));
      grid.appendChild(fieldInput("ptitle-" + i, "Başlık", p.title));
      grid.appendChild(fieldInput("pcat-" + i, "Kategori etiketi (örn. Rehber)", p.category));
      row.appendChild(grid);
      row.appendChild(fieldTextarea("pexcerpt-" + i, "Kısa özet", p.excerpt));
      row.appendChild(fieldTextarea("pbody-" + i, "İçerik", p.body));
      box.appendChild(row);
    });
  }

  function collectPosts() {
    var list = [];
    document.querySelectorAll("#postsEditor .a-row-card").forEach(function (row, i) {
      list.push({
        date: $("pdate-" + i).value.trim(),
        title: $("ptitle-" + i).value.trim(),
        category: $("pcat-" + i).value.trim(),
        excerpt: $("pexcerpt-" + i).value.trim(),
        body: $("pbody-" + i).value.trim()
      });
    });
    return list;
  }

  /* --------------------------------------------------------
     Sosyal medya editörü
     -------------------------------------------------------- */
  function renderSocialsEditor() {
    var box = $("socialsEditor");
    box.innerHTML = "";
    if (!data.socials || data.socials.length === 0) {
      box.appendChild(el("p", "a-empty", "Henüz sosyal hesap yok. '+ Yeni Hesap' ile ekleyin."));
      return;
    }
    data.socials.forEach(function (sc, i) {
      var row = el("div", "a-row-card");
      var head = el("div", "a-row-card-head");
      head.appendChild(el("strong", "", sc.label || sc.platform || ("Hesap " + (i + 1))));
      var del = el("button", "a-del", "Sil");
      del.type = "button";
      del.addEventListener("click", function () {
        data.socials.splice(i, 1);
        renderSocialsEditor();
      });
      head.appendChild(del);
      row.appendChild(head);
      var grid = el("div", "a-grid");
      grid.appendChild(fieldSelect("splatform-" + i, "Platform", sc.platform || "", {
        "": "— Seçin —",
        discord: "Discord", youtube: "YouTube", x: "X (Twitter)", instagram: "Instagram",
        steam: "Steam", twitch: "Twitch", tiktok: "TikTok", telegram: "Telegram", spotify: "Spotify"
      }));
      grid.appendChild(fieldInput("slabel-" + i, "Görünen ad (örn. MiceYama Topluluk)", sc.label));
      grid.appendChild(fieldInput("surl-" + i, "Bağlantı", sc.url));
      row.appendChild(grid);
      row.appendChild(fieldInput("sdesc-" + i, "Açıklama (örn. Yeni yamalar burada duyurulur)", sc.desc));
      box.appendChild(row);
    });
  }

  function collectSocials() {
    var list = [];
    document.querySelectorAll("#socialsEditor .a-row-card").forEach(function (row, i) {
      list.push({
        platform: $("splatform-" + i).value,
        label: $("slabel-" + i).value.trim(),
        url: $("surl-" + i).value.trim(),
        desc: $("sdesc-" + i).value.trim()
      });
    });
    return list;
  }

  /* --------------------------------------------------------
     SSS editörü
     -------------------------------------------------------- */
  function renderFaqEditor() {
    var box = $("faqEditor");
    box.innerHTML = "";
    if (data.faq.length === 0) {
      box.appendChild(el("p", "a-empty", "Henüz soru yok. '+ Yeni Soru' ile ekleyin."));
      return;
    }
    data.faq.forEach(function (f, i) {
      var row = el("div", "a-row-card");
      var head = el("div", "a-row-card-head");
      head.appendChild(el("strong", "", "Soru " + (i + 1)));
      var del = el("button", "a-del", "Sil");
      del.type = "button";
      del.addEventListener("click", function () {
        data.faq.splice(i, 1);
        renderFaqEditor();
      });
      head.appendChild(del);
      row.appendChild(head);
      row.appendChild(fieldInput("fq-" + i, "Soru", f.q));
      row.appendChild(fieldTextarea("fa-" + i, "Cevap", f.a));
      box.appendChild(row);
    });
  }

  function collectFaq() {
    var list = [];
    document.querySelectorAll("#faqEditor .a-row-card").forEach(function (row, i) {
      list.push({ q: $("fq-" + i).value.trim(), a: $("fa-" + i).value.trim() });
    });
    return list;
  }

  /* --------------------------------------------------------
     Kategori editörü
     -------------------------------------------------------- */
  function renderCatsEditor() {
    var box = $("catsEditor");
    box.innerHTML = "";
    if (data.categories.length === 0) {
      box.appendChild(el("p", "a-empty", "Henüz kategori yok. '+ Yeni Kategori' ile ekleyin."));
      return;
    }
    data.categories.forEach(function (c, i) {
      var row = el("div", "a-row-card");
      var head = el("div", "a-row-card-head");
      head.appendChild(el("strong", "", "Kategori " + (i + 1)));
      var del = el("button", "a-del", "Sil");
      del.type = "button";
      del.addEventListener("click", function () {
        var removedId = data.categories[i].id;
        data.categories.splice(i, 1);
        data.games.forEach(function (g) {
          if (g.category === removedId) g.category = "";
        });
        renderCatsEditor();
      });
      head.appendChild(del);
      row.appendChild(head);
      var grid = el("div", "a-grid");
      grid.appendChild(fieldInput("cid-" + i, "Kimlik (boşluk yok, örn. aksiyon-macera)", c.id));
      grid.appendChild(fieldInput("cname-" + i, "Ad (örn. Aksiyon & Macera)", c.name));
      row.appendChild(grid);
      box.appendChild(row);
    });
  }

  function collectCategories() {
    var list = [];
    document.querySelectorAll("#catsEditor .a-row-card").forEach(function (row, i) {
      var id = $("cid-" + i).value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
      var name = $("cname-" + i).value.trim();
      if (!id) id = "kategori-" + i;
      if (!name) name = "Kategori " + (i + 1);
      list.push({ id: id, name: name });
    });
    return list;
  }

  /* --------------------------------------------------------
     Ayarlar editörü
     -------------------------------------------------------- */
  function renderSettingsEditor() {
    var s = data.settings || {};
    $("setName").value = s.siteName || "";
    $("setBadge").value = s.heroBadge || "";
    $("setHeroTitle").value = s.heroTitle || "";
    $("setHeroSub").value = s.heroSub || "";
    $("setEmail").value = s.email || "";
    $("setEmailNote").value = s.emailNote || "";
    $("setFooterNote").value = s.footerNote || "";
  }

  function collectSettings() {
    return {
      siteName: $("setName").value.trim(),
      tagline: $("setName").value.trim() + " — Türkçe oyun yama arşivi",
      heroBadge: $("setBadge").value.trim(),
      heroTitle: $("setHeroTitle").value.trim(),
      heroSub: $("setHeroSub").value.trim(),
      email: $("setEmail").value.trim(),
      emailNote: $("setEmailNote").value.trim(),
      footerNote: $("setFooterNote").value.trim()
    };
  }

  /* --------------------------------------------------------
     İndirme editörü
     -------------------------------------------------------- */
  function renderDownloadEditor() {
    var d = data.download || {};
    $("dlVersion").value = d.version || "";
    $("dlSize").value = d.size || "";
    $("dlNote").value = d.note || "";
    $("dlUrl").value = d.url || "";
  }

  function collectDownload() {
    return {
      enabled: !!$("dlUrl").value.trim(),
      version: $("dlVersion").value.trim(),
      size: $("dlSize").value.trim(),
      url: $("dlUrl").value.trim(),
      note: $("dlNote").value.trim()
    };
  }

  /* --------------------------------------------------------
     Son GitHub sürümünü çek (yalnızca okuma, public API)
     -------------------------------------------------------- */
  function formatBytes(bytes) {
    if (typeof bytes !== "number" || isNaN(bytes)) return null;
    var units = ["B", "KB", "MB", "GB"];
    var i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return bytes.toFixed(bytes >= 100 ? 0 : 1) + " " + units[i];
  }

  function fetchLatestRelease() {
    $("uploadStatus").textContent = "GitHub'dan son sürüm alınıyor…";
    fetch("https://api.github.com/repos/" + OWNER + "/" + REPO + "/releases", {
      headers: { Accept: "application/vnd.github+json" }
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (releases) {
      if (!Array.isArray(releases) || releases.length === 0) {
        throw new Error("yayın yok");
      }
      var asset = null;
      for (var i = 0; i < releases.length; i++) {
        if (releases[i].draft) continue;
        var assets = Array.isArray(releases[i].assets) ? releases[i].assets : [];
        for (var j = 0; j < assets.length; j++) {
          if (assets[j].name === "yama.mr") { asset = assets[j]; break; }
        }
        if (asset) break;
      }
      if (!asset) throw new Error("yamalı sürüm bulunamadı");
      $("dlVersion").value = releases[i].tag_name ? releases[i].tag_name.replace(/^v/, "") : "";
      $("dlSize").value = formatBytes(asset.size) || "";
      $("dlUrl").value = asset.browser_download_url;
      $("uploadStatus").textContent = "Son sürüm getirildi. Kaydetmeyi unutmayın.";
    }).catch(function (err) {
      $("uploadStatus").textContent = "Alınamadı: " + err.message;
    });
  }

  /* --------------------------------------------------------
     Setup dosyası yükleme (repo'ya commit)
     -------------------------------------------------------- */
  function uploadFile(file) {
    if (!file) return;
    $("uploadStatus").textContent = "Yükleniyor: " + file.name + "…";
    var reader = new FileReader();
    reader.onload = function () {
      var b64 = String(reader.result).split(",")[1];
      var path = "data/files/" + file.name;
      ghPut(path, "Yama dosyası: " + file.name, b64)
        .then(function () {
          $("dlSize").value = formatBytes(file.size) || "";
          $("dlUrl").value =
            "https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/" + BRANCH +
            "/data/files/" + encodeURIComponent(file.name);
          $("uploadStatus").textContent =
            "Yüklendi: " + file.name + " (" + formatBytes(file.size) + "). " +
            "İndirme bağlantısı otomatik dolduruldu — kaydetmeyi unutmayın.";
        })
        .catch(function (err) {
          $("uploadStatus").textContent = "Yükleme hatası: " + hintFor(err) +
            " (100 MB üzeri dosyalar için GitHub Release'e yükleyip bağlantı verin).";
        });
    };
    reader.onerror = function () {
      $("uploadStatus").textContent = "Dosya okunamadı.";
    };
    reader.readAsDataURL(file);
  }

  /* --------------------------------------------------------
     Kaydet
     -------------------------------------------------------- */
  function save() {
    data.settings = collectSettings();
    data.download = collectDownload();
    data.categories = collectCategories();
    data.games = collectGames();
    data.announcements = collectAnnouncements();
    data.announcementCategories = collectAnnouncementCategories();
    data.posts = collectPosts();
    data.socials = collectSocials();
    data.faq = collectFaq();
    if (!data.download.url) data.download.enabled = false;
    if (data.download.url) data.download.enabled = true;

    setStatus("Kaydediliyor…", false);
    uploadPendingImages(data.games).then(function () {
      return saveData();
    }).then(function () {
      pendingImages = {};
      setStatus("Kaydedildi. Site birkaç dakika içinde güncellenir.", true);
    }).catch(function (err) {
      setStatus("Kaydedilemedi: " + hintFor(err), false);
    });
  }

  /* --------------------------------------------------------
     Giriş
     -------------------------------------------------------- */
  function tryConnect() {
    $("loginError").textContent = "";
    $("loginBtn").disabled = true;
    $("loginBtn").textContent = "Bağlanılıyor…";
    checkAccess().then(function () {
      return loadData();
    }).then(function () {
      showPanel();
      renderAll();
    }).catch(function (err) {
      $("loginError").textContent = "Bağlantı kurulamadı: " + hintFor(err);
    }).finally(function () {
      $("loginBtn").disabled = false;
      $("loginBtn").textContent = "Bağlan";
    });
  }

  function logout() {
    data = null;
    showLogin();
  }

  function renderAll() {
    renderCatsEditor();
    renderGamesEditor();
    renderAnnounceEditor();
    renderAnnounceCatsEditor();
    renderPostsEditor();
    renderSocialsEditor();
    renderFaqEditor();
    renderSettingsEditor();
    renderDownloadEditor();
    setStatus("", false);
    $("uploadStatus").textContent = "";
  }

  /* --------------------------------------------------------
     Başlat
     -------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", function () {
    initTabs();

    $("loginBtn").addEventListener("click", tryConnect);
    $("logoutBtn").addEventListener("click", logout);
    $("saveBtn").addEventListener("click", save);
    $("addGameBtn").addEventListener("click", function () {
      data.games.push({
        id: "g" + Date.now().toString(36),
        name: "Yeni Oyun",
        year: "",
        category: "",
        desc: "",
        tags: [],
        status: "yayinda",
        progress: null,
        download: false,
        downloadUrl: "",
        tone: "indigo",
        badge: "Türkçe Yama"
      });
      renderGamesEditor();
    });
    $("addFaqBtn").addEventListener("click", function () {
      data.faq.push({ q: "Yeni soru", a: "Yeni cevap" });
      renderFaqEditor();
    });
    $("addCatBtn").addEventListener("click", function () {
      data.categories.push({ id: "yeni-kategori", name: "Yeni Kategori" });
      renderCatsEditor();
    });
    $("addAnnounceBtn").addEventListener("click", function () {
      if (!data.announcements) data.announcements = [];
      data.announcements.push({ date: "", title: "Yeni Duyuru", category: "", body: "" });
      renderAnnounceEditor();
    });
    $("addAnnounceCatBtn").addEventListener("click", function () {
      if (!data.announcementCategories) data.announcementCategories = [];
      data.announcementCategories.push({ id: "yeni-kategori", name: "Yeni Kategori" });
      renderAnnounceCatsEditor();
    });
    $("addPostBtn").addEventListener("click", function () {
      if (!data.posts) data.posts = [];
      data.posts.push({ date: "", title: "Yeni Yazı", category: "", excerpt: "", body: "" });
      renderPostsEditor();
    });
    $("addSocialBtn").addEventListener("click", function () {
      if (!data.socials) data.socials = [];
      data.socials.push({ platform: "discord", label: "MiceYama Topluluk", url: "", desc: "" });
      renderSocialsEditor();
    });
    $("fetchReleaseBtn").addEventListener("click", fetchLatestRelease);
    $("fileInput").addEventListener("change", function () {
      uploadFile(this.files[0]);
      this.value = "";
    });

    showLogin();
  });
})();
