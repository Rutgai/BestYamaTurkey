/* ============================================================
   MiceYama — site mantığı (paylaşımlı, çok sayfalı)
   Sayfalar: home, archive (yamalar), game (oyun),
             duyurular, blog, sosyal, uyelik
   Özellikler: özel imleç, preloader, manyetik butonlar,
               drop menüler, çeviri durumu, üyelik kilidi.
   Veri: data/site-data.json (GitHub deposu üzerinden)
   ============================================================ */
(function () {
  "use strict";

  var OWNER = "Rutgai";
  var REPO = "BestYamaTurkey";
  var BRANCH = "main";

  var DEFAULT_DATA = {
    settings: {
      siteName: "MiceYama",
      tagline: "Türkçe oyun yama arşivi",
      heroBadge: "Türkçe Yama Arşivi",
      heroTitle: "Tüm oyunlarınız, Türkçe.",
      heroSub: "MiceYama, en sevdiğiniz oyunlar için profesyonel Türkçe çeviri yamaları üretir.",
      email: "destek@miceyama.com",
      emailNote: "En geç 24 saat içinde dönüş yapıyoruz.",
      footerNote: "© 2026 MiceYama."
    },
    categories: [],
    games: [],
    announcementCategories: [],
    announcements: [],
    posts: [],
    socials: [],
    download: { enabled: false, version: "", size: "", url: "", note: "Yakında sunulacaktır." },
    faq: []
  };

  var CURRENT_DATA = null;
  var authUser = null;
  var identityReady = false;

  /* --------------------------------------------------------
     Yardımcılar
     -------------------------------------------------------- */
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function esc(s) { return String(s == null ? "" : s); }

  function urlParam(name) {
    var m = new RegExp("[?&]" + name + "=([^&#]*)").exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : "";
  }

  function pageName() {
    return document.body.getAttribute("data-page") || "home";
  }

  function catName(list, id) {
    var f = null;
    (list || []).forEach(function (c) { if (c.id === id) f = c; });
    return f ? f.name : "";
  }

  function gameDownloadUrl(g, dl) {
    if (!g) return "";
    if (g.downloadUrl) return g.downloadUrl;
    if (g.download && dl && dl.url) return dl.url;
    return "";
  }

  /* --------------------------------------------------------
     Çeviri durumu
     -------------------------------------------------------- */
  function statusInfo(g) {
    var s = (g && g.status) || "yapim";
    if (s === "yayinda" || s === "tamamlandi") return { label: "Yayında", cls: "ok" };
    if (s === "testte") return { label: "Testte", cls: "wait" };
    if (s === "beklemede") return { label: "Beklemede", cls: "wait" };
    return { label: "Çevriliyor", cls: "wait" };
  }

  function progressOf(g) {
    var p = Number(g && g.progress);
    return isNaN(p) ? 0 : Math.max(0, Math.min(100, p));
  }

  function inProgress(g) {
    var s = g && g.status;
    return s === "yapim" || s === "testte";
  }

  /* --------------------------------------------------------
     Üyelik (Netlify Identity)
     -------------------------------------------------------- */
  function hasIdentity() { return !!(window.netlifyIdentity); }
  function isMember() { return !!authUser; }
  function gateEnabled() { return identityReady && !isMember(); }
  function identityOpen() { if (hasIdentity()) window.netlifyIdentity.open(); }

  function renderAuthUI() {
    var area = qs("#authArea");
    if (!area) return;
    area.innerHTML = "";
    if (!identityReady) return;
    if (isMember()) {
      var chip = el("div", "user-chip");
      var meta = (authUser.user_metadata && authUser.user_metadata.full_name) || authUser.email || "Üye";
      chip.appendChild(el("span", "user-avatar", meta.charAt(0).toUpperCase()));
      chip.appendChild(el("span", "user-name", meta));
      var out = el("button", "btn btn-ghost btn-sm", "Çıkış");
      out.type = "button";
      out.addEventListener("click", function () { if (hasIdentity()) window.netlifyIdentity.logout(); });
      chip.appendChild(out);
      area.appendChild(chip);
    } else {
      var go = el("button", "btn btn-ghost btn-sm", "Giriş Yap / Üye Ol");
      go.type = "button";
      go.addEventListener("click", identityOpen);
      area.appendChild(go);
    }
  }

  function initIdentity() {
    if (!hasIdentity()) { renderAuthUI(); return; }
    try {
      window.netlifyIdentity.on("init", function (u) { identityReady = true; authUser = u || null; renderAuthUI(); renderCurrent(); });
      window.netlifyIdentity.on("login", function (u) { authUser = u; identityReady = true; renderAuthUI(); renderCurrent(); });
      window.netlifyIdentity.on("logout", function () { authUser = null; renderAuthUI(); renderCurrent(); });

      // Widget head'de otomatik başlarken "init"/"login" olayları bu dinleyiciler
      // kaydedilmeden önce fırlayabilir; kayıtlı oturumu currentUser() ile geri kurtar.
      var attempts = 0;
      (function pollCurrent() {
        if (identityReady && authUser) return;
        var w = window.netlifyIdentity;
        var widgetDone = !!(w && w.store && w.store.gotrue);
        var cu = widgetDone && w.currentUser ? w.currentUser() : null;
        if (cu) {
          identityReady = true;
          authUser = cu;
          renderAuthUI();
          renderCurrent();
          return;
        }
        if (!widgetDone && attempts < 25) {
          attempts++;
          setTimeout(pollCurrent, 150);
        } else {
          identityReady = true;
          renderAuthUI();
          renderCurrent();
        }
      })();
    } catch (e) { /* widget yoksa sessiz */ }
  }

  /* --------------------------------------------------------
     Veri yükleme (raw > CDN > yerel > varsayılan)
     -------------------------------------------------------- */
  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function loadData() {
    // Önce gh fonksiyonu (GitHub API — her zaman taze; admin kaydı anında görünür).
    // Arıza olursa: raw > CDN > yerel > varsayılan.
    function ghJson() {
      return fetch("/.netlify/functions/gh?path=data/site-data.json", { cache: "no-store" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (gh) {
          if (!gh || !gh.content) throw new Error("gh icerik yok");
          var bin = atob(String(gh.content).replace(/\s+/g, ""));
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return JSON.parse(new TextDecoder("utf-8").decode(bytes));
        });
    }
    var raw = "https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/" + BRANCH + "/data/site-data.json";
    var cdn = "https://cdn.jsdelivr.net/gh/" + OWNER + "/" + REPO + "@" + BRANCH + "/data/site-data.json";
    return ghJson()
      .catch(function () { return fetchJson(raw); })
      .catch(function () { return fetchJson(cdn); })
      .catch(function () { return fetchJson("data/site-data.json"); })
      .catch(function () { return DEFAULT_DATA; });
  }

  /* --------------------------------------------------------
     İkonlar
     -------------------------------------------------------- */
  function svgIcon(paths, vb) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", vb || "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    paths.forEach(function (d) {
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    });
    return svg;
  }

  function dlIcon() {
    var i = svgIcon(["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"]);
    i.setAttribute("width", "18"); i.setAttribute("height", "18");
    return i;
  }

  function lockIcon() {
    var i = svgIcon(["M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z", "M7 11V7a5 5 0 0 1 10 0v4"]);
    i.setAttribute("width", "16"); i.setAttribute("height", "16");
    return i;
  }

  var SOCIAL_ICONS = {
    discord: ["M20.3 4.4A19.8 19.8 0 0 0 15.9 3l-.3 1.5a18 18 0 0 0-5.2 0L10 3a19.8 19.8 0 0 0-4.4 1.4A20 20 0 0 0 1 17a19.7 19.7 0 0 0 6 3l1.2-2a12.9 12.9 0 0 1-2-1l.4-.4a14 14 0 0 0 11 0l.4.4a12.9 12.9 0 0 1-2 1l1.2 2a19.7 19.7 0 0 0 6-3 20 20 0 0 0-4.9-12.6zM8.7 14.8c-1 0-1.7-1-1.7-2.1s.7-2.1 1.7-2.1 1.8 1 1.7 2.1-.7 2.1-1.7 2.1zm6.6 0c-1 0-1.7-1-1.7-2.1s.7-2.1 1.7-2.1 1.8 1 1.7 2.1-.7 2.1-1.7 2.1z"],
    youtube: ["M2.5 17a2.4 2.4 0 0 0 2.5 2.1h14a2.4 2.4 0 0 0 2.5-2.1V7a2.4 2.4 0 0 0-2.5-2.1H5A2.4 2.4 0 0 0 2.5 7z", "M10 15V9l5 3z"],
    x: ["M18.9 2H22l-6.8 7.8L23 22h-6.3l-4.9-6.4L6.2 22H3l7.3-8.4L1 2h6.4l4.4 5.8z"],
    instagram: ["M16 3H8a5 5 0 0 0-5 5v8a5 5 0 0 0 5 5h8a5 5 0 0 0 5-5V8a5 5 0 0 0-5-5z", "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z", "M17.6 6.4h.01"],
    steam: ["M12 2a9.5 9.5 0 0 1 9.2 11.4 3.6 3.6 0 0 0-5 4.5l-1.8 1.6a9.5 9.5 0 1 1-2.4-17.5z", "M16.9 12.9a2.4 2.4 0 1 0 2.4 2.4", "M7.5 8.6l4.4 2.4"],
    twitch: ["M4 3 2.5 6.5V20H7v3h3l3-3h4.5L21 16V3z", "M15 9v5", "M10.5 9v5"],
    tiktok: ["M15 4v10.2a4.7 4.7 0 1 1-4.1-4.7", "M15 4c.3 3 2.4 5 5 5.4"],
    telegram: ["M21.5 3.5 2 12l6 2.2L9.6 20l3.5-3.2 5 3.7L21.5 3.5z"],
    spotify: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M7.5 12.3c2.7-1.3 6.5-1.4 9-.2", "M6.6 8.9c3.4-1.5 8-.7 11 1", "M8.4 15.6c2-1 4.9-1.1 6.9-.2"]
  };

  var SOCIAL_COLORS = {
    discord: "#5865F2", youtube: "#FF0000", x: "#e7e9ea", instagram: "#E1306C",
    steam: "#1b2838", twitch: "#9146FF", tiktok: "#69C9D0", telegram: "#229ED9", spotify: "#1DB954"
  };

  function socialIcon(key) {
    var paths = SOCIAL_ICONS[key];
    var i = paths ? svgIcon(paths) : svgIcon(["M5 12h14", "M12 5l7 7-7 7"]);
    i.setAttribute("width", "24"); i.setAttribute("height", "24");
    i.setAttribute("stroke-width", "1.8");
    return i;
  }

  /* --------------------------------------------------------
     İndirme butonu (üyelik engeli)
     -------------------------------------------------------- */
  function buildDownload(dlUrl, opts) {
    opts = opts || {};
    var cls = "btn btn-primary " + (opts.cls || "");
    if (!dlUrl) {
      var d = el("span", "btn-disabled " + (opts.cls || ""));
      d.textContent = opts.waitLabel || "Yakında";
      return d;
    }
    if (!gateEnabled()) {
      var a = el("a", cls);
      a.href = dlUrl;
      a.setAttribute("download", "");
      a.appendChild(dlIcon());
      a.appendChild(el("span", "", opts.label || "İndir"));
      return a;
    }
    var b = el("button", cls);
    b.type = "button";
    b.setAttribute("data-dl", dlUrl);
    b.appendChild(lockIcon());
    b.appendChild(el("span", "", opts.lockLabel || "Giriş Yap & İndir"));
    b.addEventListener("click", identityOpen);
    return b;
  }

  function emptyState(title, text) {
    var box = el("div", "empty-state reveal");
    var ico = el("div", "empty-ico");
    ico.appendChild(svgIcon(["M12 2v6", "M12 18v4", "M4.9 5l4.2 4.2", "M14.9 15l4.2 4.2", "M2 12h6", "M16 12h6", "M4.9 19l4.2-4.2", "M14.9 9l4.2-4.2"]));
    box.appendChild(ico);
    box.appendChild(el("h3", "", title || "Henüz içerik yok"));
    box.appendChild(el("p", "", text || "İçerikler eklendiğinde burada görünecek."));
    return box;
  }

  /* --------------------------------------------------------
     Oyun kartı
     -------------------------------------------------------- */
  function gameCard(g, dl, categories) {
    var card = el("article", "card game-card reveal");
    var info = statusInfo(g);

    var cover = el("div", "game-cover tone-" + (g.tone || "indigo"));
    var top = el("div", "game-cover-top");
    var t = el("div", "");
    t.appendChild(el("span", "game-title", g.name || "Oyun"));
    if (g.year) t.appendChild(el("div", "game-sub", g.year));
    top.appendChild(t);
    top.appendChild(el("span", "tag on-cover", g.badge || info.label));
    cover.appendChild(top);

    var link = el("a", "");
    link.href = "oyun.html?id=" + encodeURIComponent(g.id);
    link.appendChild(cover);

    var body = el("div", "game-body");
    var line = el("div", "game-body-line");
    line.appendChild(el("span", "tag " + info.cls, "Çeviri Durumu: " + info.label));
    var cat = catName(categories, g.category);
    if (cat) line.appendChild(el("span", "tag cyan", cat));
    body.appendChild(line);
    body.appendChild(el("h3", "", g.name || "Oyun"));
    body.appendChild(el("p", "game-desc", g.desc || ""));

    var meta = el("div", "game-meta");
    (Array.isArray(g.tags) ? g.tags : []).forEach(function (tg) { meta.appendChild(el("span", "", tg)); });
    body.appendChild(meta);

    if (inProgress(g)) {
      var p = progressOf(g);
      if (p > 0) {
        var pbar = el("div", "card-progress");
        var bar = el("div", "card-progress-bar");
        var fill = el("span", "");
        fill.style.width = p + "%";
        bar.appendChild(fill);
        pbar.appendChild(bar);
        pbar.appendChild(el("span", "", "%" + p));
        body.appendChild(pbar);
      }
    }

    body.appendChild(buildDownload(gameDownloadUrl(g, dl), { cls: "game-dl" }));

    card.appendChild(link);
    card.appendChild(body);
    return card;
  }

  /* --------------------------------------------------------
     Sayfa başlığı / boş durum yardımcıları
     -------------------------------------------------------- */
  function setText(id, text) {
    var n = qs("#" + id);
    if (n) n.textContent = text == null ? "" : text;
  }

  /* ============================================================
     ANA SAYFA
     ============================================================ */
  function renderHome(data) {
    var s = data.settings || {};
    var dl = data.download || {};
    var games = data.games || [];
    var cats = data.categories || [];

    setText("heroBadge", s.heroBadge || "Türkçe Yama Arşivi");
    var title = qs("#heroTitle");
    if (title) {
      var raw = esc(s.heroTitle || "Tüm oyunlarınız, Türkçe.");
      title.innerHTML = raw.replace(/Türkçe\./g, '<span class="grad-text">Türkçe.</span>');
    }
    setText("heroSub", s.heroSub || "");

    var count = qs("#heroCount");
    if (count) {
      count.hidden = games.length === 0;
      if (games.length > 0) count.textContent = "(" + games.length + ")";
    }

    setText("statTotal", games.length);
    setText("statCats", cats.length);
    setText("statWork", games.filter(inProgress).length);

    // Kategoriler
    var catGrid = qs("#catGrid");
    if (catGrid) {
      catGrid.innerHTML = "";
      if (cats.length === 0) catGrid.appendChild(emptyState("Henüz kategori yok", "Kategoriler eklendiğinde burada listelenecek."));
      cats.forEach(function (c) {
        var n = games.filter(function (g) { return g.category === c.id; }).length;
        var card = el("a", "card cat-card reveal");
        card.href = "yamalar.html?k=" + encodeURIComponent(c.id);
        var icon = el("div", "cat-icon");
        icon.appendChild(el("span", "", catGlyph(c)));
        card.appendChild(icon);
        card.appendChild(el("h3", "", c.name || "Kategori"));
        card.appendChild(el("p", "", n + " yama"));
        card.appendChild(el("span", "cat-go", "İncele →"));
        catGrid.appendChild(card);
      });
    }

    // Son yamalar
    var grid = qs("#latestGrid");
    if (grid) {
      grid.innerHTML = "";
      var latest = games.slice().slice(0, 6);
      if (latest.length === 0) grid.appendChild(emptyState("Henüz yama yayınlanmadı", "Yayınlanan yamalar burada görünecek."));
      latest.forEach(function (g) { grid.appendChild(gameCard(g, dl, cats)); });
    }

    // Devam eden çalışmalar
    var works = qs("#worksList");
    if (works) {
      works.innerHTML = "";
      var inW = games.filter(inProgress);
      if (inW.length === 0) works.appendChild(emptyState("Devam eden çalışma yok", "Üzerinde çalışılan yamalar burada görünecek."));
      inW.forEach(function (g) {
        var st = statusInfo(g);
        var item = el("article", "work reveal");
        var top = el("div", "work-top");
        top.appendChild(el("h3", "", (g.name || "Oyun") + " — Türkçe Yama"));
        top.appendChild(el("span", "tag " + st.cls, "Çeviri Durumu: " + st.label));
        item.appendChild(top);
        var bar = el("div", "work-bar");
        var fill = el("span", "");
        fill.style.width = progressOf(g) + "%";
        bar.appendChild(fill);
        item.appendChild(bar);
        var bottom = el("div", "work-bottom");
        var r1 = el("span", "");
        r1.appendChild(el("strong", "", "İlerleme: %" + progressOf(g)));
        bottom.appendChild(r1);
        if (g.desc) bottom.appendChild(el("span", "", g.desc));
        item.appendChild(bottom);
        works.appendChild(item);
      });
    }

    // Duyurular (öne çıkanlar)
    var annGrid = qs("#homeAnnounce");
    if (annGrid) {
      annGrid.innerHTML = "";
      var anns = (data.announcements || []).slice().slice(0, 4);
      if (anns.length === 0) annGrid.appendChild(emptyState("Henüz duyuru yok", "Duyurular eklendiğinde burada görünecek."));
      anns.forEach(function (a) { annGrid.appendChild(annCard(a)); });
    }

    // Blog (öne çıkanlar)
    var blogGrid = qs("#homePosts");
    if (blogGrid) {
      blogGrid.innerHTML = "";
      var posts = (data.posts || []).slice().slice(0, 4);
      if (posts.length === 0) blogGrid.appendChild(emptyState("Henüz yazı yok", "Yazılar ve bloglar burada görünecek."));
      posts.forEach(function (p) { blogGrid.appendChild(postCard(p)); });
    }

    // İndirme paneli
    var panel = qs("#dlPanelInfo");
    if (panel) {
      panel.innerHTML = "";
      var info = el("div", "dl-info");
      info.appendChild(el("h3", "", "Yamayı İndirin"));
      var parts = [];
      if (dl.version) parts.push("Sürüm v" + esc(dl.version));
      if (dl.size) parts.push(esc(dl.size));
      if (dl.note) parts.push(esc(dl.note));
      info.appendChild(el("p", "", parts.join(" • ") || "Tek tıkla iner, kurulumu kolaydır."));
      panel.appendChild(info);
      panel.appendChild(buildDownload(dl.url, { cls: "btn-xl", label: "Yama İndirin", lockLabel: "Giriş Yap & İndir", waitLabel: "Yakında" }));
    }

    // SSS
    var faq = qs("#faqList");
    if (faq) {
      faq.innerHTML = "";
      if ((data.faq || []).length === 0) faq.appendChild(emptyState("Henüz soru yok", "Sık sorulan sorular burada görünecek."));
      (data.faq || []).forEach(function (f) {
        var d = el("details", "faq-item reveal");
        d.appendChild(el("summary", "", f.q || "?"));
        var a = el("div", "faq-a");
        a.appendChild(el("p", "", f.a || ""));
        d.appendChild(a);
        faq.appendChild(d);
      });
      faq.addEventListener("toggle", function (e) {
        if (e.target.tagName === "DETAILS" && e.target.open) {
          qsa("details[open]", faq).forEach(function (o) { if (o !== e.target) o.open = false; });
        }
      });
    }

    renderFooterShared(data);
    observeReveals(document);
  }

  function catGlyph(c) {
    var glyphs = { "mutfak-simulasyon": "🍳", "aksiyon-macera": "⚔️", "hikaye-rol": "📖" };
    return glyphs[c.id] || "🎮";
  }

  /* --------------------------------------------------------
     Duyuru / blog kartları
     -------------------------------------------------------- */
  function annCard(a) {
    var card = el("article", "card announce reveal");
    var head = el("div", "card-head");
    if (a.category) head.appendChild(el("span", "tag cyan", a.category));
    if (a.date) head.appendChild(el("span", "card-date", a.date));
    card.appendChild(head);
    card.appendChild(el("h3", "", a.title || "Duyuru"));
    if (a.body) {
      var det = el("details", "expand");
      det.appendChild(el("summary", "", "Devamını oku"));
      det.appendChild(el("div", "exp-body", a.body));
      card.appendChild(det);
    }
    return card;
  }

  function postCard(p) {
    var card = el("article", "card post reveal");
    var head = el("div", "card-head");
    if (p.category) head.appendChild(el("span", "tag cyan", p.category));
    if (p.date) head.appendChild(el("span", "card-date", p.date));
    card.appendChild(head);
    card.appendChild(el("h3", "", p.title || "Yazı"));
    card.appendChild(el("p", "", p.excerpt || ""));
    if (p.body) {
      var det = el("details", "expand");
      det.appendChild(el("summary", "", "Devamını oku"));
      det.appendChild(el("div", "exp-body", p.body));
      card.appendChild(det);
    }
    return card;
  }

  /* ============================================================
     ARŞİV (YAMALAR)
     ============================================================ */
  function renderArchive(data) {
    var dl = data.download || {};
    var games = data.games || [];
    var cats = data.categories || [];
    var active = urlParam("k");

    var chips = qs("#catChips");
    if (chips) {
      chips.innerHTML = "";
      var all = el("a", "chip" + (active === "" ? " is-active" : ""), "Tümü");
      all.href = "yamalar.html";
      chips.appendChild(all);
      cats.forEach(function (c) {
        var a = el("a", "chip" + (active === c.id ? " is-active" : ""), c.name);
        a.href = "yamalar.html?k=" + encodeURIComponent(c.id);
        chips.appendChild(a);
      });
    }

    var list = qs("#archiveGrid");
    if (list) {
      list.innerHTML = "";
      var filtered = active ? games.filter(function (g) { return g.category === active; }) : games;
      setText("archiveTitle", active ? (catName(cats, active) || "Kategori") : "Yama Arşivi");
      setText("archiveSub", filtered.length + " yama");
      if (filtered.length === 0) {
        list.appendChild(emptyState(active ? "Bu kategoride yama yok" : "Henüz yama yok", "Yamalar eklendiğinde burada görünecek."));
      } else {
        filtered.forEach(function (g) { list.appendChild(gameCard(g, dl, cats)); });
      }
    }
    observeReveals(document);
  }

  /* ============================================================
     OYUN DETAY
     ============================================================ */
  function renderGame(data) {
    var dl = data.download || {};
    var games = data.games || [];
    var cats = data.categories || [];
    var id = urlParam("id");
    var g = null;
    games.forEach(function (x) { if (x.id === id) g = x; });

    var wrap = qs("#gameWrap");
    if (!wrap) return;
    wrap.innerHTML = "";
    if (!g) {
      wrap.appendChild(emptyState("Oyun bulunamadı", "Aradığınız oyun arşivde yok."));
      observeReveals(document);
      return;
    }

    var info = statusInfo(g);
    var cover = el("div", "game-page-cover tone-" + (g.tone || "indigo"));
    var inner = el("div", "inner");
    var crumb = el("div", "breadcrumb");
    var h = el("a", "", "AnaSayfa"); h.href = "index.html"; crumb.appendChild(h);
    crumb.appendChild(el("span", "sep", "›"));
    var ar = el("a", "", "Yama Arşivi"); ar.href = "yamalar.html" + (g.category ? "?k=" + encodeURIComponent(g.category) : ""); crumb.appendChild(ar);
    crumb.appendChild(el("span", "sep", "›"));
    crumb.appendChild(el("span", "", g.name || "Oyun"));
    inner.appendChild(crumb);
    inner.appendChild(el("h1", "game-page-title", g.name || "Oyun"));
    var bl = el("div", "badge-line");
    bl.appendChild(el("span", "tag on-cover", g.badge || info.label));
    var cat = catName(cats, g.category);
    if (cat) bl.appendChild(el("span", "tag on-cover", cat));
    inner.appendChild(bl);
    cover.appendChild(inner);
    wrap.appendChild(cover);

    var body = el("div", "game-page-body");
    var dlg = gameDownloadUrl(g, dl);
    var pnl = el("div", "dl-panel");
    var pInfo = el("div", "dl-info");
    pInfo.appendChild(el("h3", "", "Yamayı İndirin"));
    var parts = [];
    if (dl.version) parts.push("Sürüm v" + esc(dl.version));
    if (dl.size) parts.push(esc(dl.size));
    if (dl.note) parts.push(esc(dl.note));
    pInfo.appendChild(el("p", "", parts.join(" • ") || (dlg ? "Tek tıkla iner, kurulumu kolaydır." : "Çeviri tamamlandığında buradan yayınlanacak.")));
    pnl.appendChild(pInfo);
    pnl.appendChild(buildDownload(dlg, { label: "İndir", lockLabel: "İndirmek için Giriş Yap", waitLabel: "Yakında" }));
    body.appendChild(pnl);

    body.appendChild(el("h2", "", "Açıklama"));
    body.appendChild(el("p", "game-page-desc", g.desc || "Bu oyun için bir Türkçe çeviri yaması hazırlanıyor."));

    body.appendChild(el("h2", "", "Bilgiler"));
    var il = el("div", "info-list");
    il.appendChild(infoItem("Çeviri Durumu", info.label + (inProgress(g) && progressOf(g) > 0 ? " (%" + progressOf(g) + ")" : "")));
    if (g.year) il.appendChild(infoItem("Çıkış Yılı", g.year));
    if (cat) il.appendChild(infoItem("Kategori", cat));
    il.appendChild(infoItem("Platform", (Array.isArray(g.tags) ? g.tags : []).join(" • ") || "—"));
    body.appendChild(il);

    wrap.appendChild(body);
    observeReveals(document);
  }

  function infoItem(lbl, val) {
    var item = el("div", "info-item");
    item.appendChild(el("div", "lbl", lbl));
    item.appendChild(el("div", "val", val));
    return item;
  }

  /* ============================================================
     DUYURULAR
     ============================================================ */
  function renderAnnouncements(data) {
    var items = data.announcements || [];
    var cats = data.announcementCategories || [];
    var active = urlParam("k");

    var chips = qs("#annChips");
    if (chips) {
      chips.innerHTML = "";
      var all = el("a", "chip" + (active === "" ? " is-active" : ""), "Tümü");
      all.href = "duyurular.html";
      chips.appendChild(all);
      cats.forEach(function (c) {
        var a = el("a", "chip" + (active === c.id ? " is-active" : ""), c.name);
        a.href = "duyurular.html?k=" + encodeURIComponent(c.id);
        chips.appendChild(a);
      });
    }

    var list = qs("#annGrid");
    if (list) {
      list.innerHTML = "";
      var filtered = active ? items.filter(function (a) { return a.category === active; }) : items;
      setText("annTitle", active ? (catName(cats, active) || "Kategori") : "Duyurular");
      if (filtered.length === 0) {
        list.appendChild(emptyState(active ? "Bu kategoride duyuru yok" : "Henüz duyuru yok", "Duyurular eklendiğinde burada görünecek."));
      } else {
        filtered.forEach(function (a) { list.appendChild(annCard(a)); });
      }
    }
    observeReveals(document);
  }

  /* ============================================================
     BLOG (TÜM YAZILAR)
     ============================================================ */
  function renderBlog(data) {
    var posts = data.posts || [];
    var list = qs("#postGrid");
    if (list) {
      list.innerHTML = "";
      setText("postCount", posts.length + " yazı");
      if (posts.length === 0) {
        list.appendChild(emptyState("Henüz yazı yok", "Blog yazıları eklendiğinde burada görünecek."));
      } else {
        posts.slice().reverse().forEach(function (p) { list.appendChild(postCard(p)); });
      }
    }
    observeReveals(document);
  }

  /* ============================================================
     SOSYAL
     ============================================================ */
  function renderSocial(data) {
    var socials = data.socials || [];
    var list = qs("#socialGrid");
    if (list) {
      list.innerHTML = "";
      if (socials.length === 0) {
        list.appendChild(emptyState("Henüz sosyal hesap yok", "Topluluk hesapları eklendiğinde burada görünecek."));
      }
      socials.forEach(function (sc) {
        var key = String(sc.platform || "").toLowerCase();
        var card = el("a", "card social-card reveal");
        card.href = sc.url || "#";
        card.target = "_blank";
        card.rel = "noopener";
        var ico = el("div", "social-ico");
        ico.style.background = SOCIAL_COLORS[key] || "var(--grad)";
        ico.appendChild(socialIcon(key));
        card.appendChild(ico);
        card.appendChild(el("h3", "", sc.label || sc.platform));
        if (sc.desc) card.appendChild(el("p", "", sc.desc));
        card.appendChild(el("span", "cat-go", "Takip Et →"));
        list.appendChild(card);
      });
    }
    observeReveals(document);
  }

  /* ============================================================
     ÜYELİK
     ============================================================ */
  function renderMembership(data) {
    var s = data.settings || {};
    setText("memberEmail", s.email || "");

    var box = qs("#memberBox");
    if (box) {
      box.innerHTML = "";
      var state = el("div", "member-state");
      if (identityReady && isMember()) {
        state.appendChild(el("h3", "", "Hoş geldiniz, " + ((authUser.user_metadata && authUser.user_metadata.full_name) || authUser.email) + "!"));
        state.appendChild(el("p", "", "Artık tüm yamaları indirebilirsiniz."));
        if (authUser.email) state.appendChild(el("p", "member-account", "Hesap: " + authUser.email));
        var out = el("button", "btn btn-ghost btn-lg", "Çıkış Yap");
        out.type = "button";
        out.addEventListener("click", function () { if (hasIdentity()) window.netlifyIdentity.logout(); });
        state.appendChild(out);
      } else {
        state.appendChild(el("h3", "", "Topluluğa katılın"));
        state.appendChild(el("p", "", "Üyelik ücretsizdir. Yamaları indirmek için giriş yapmanız yeterlidir."));
        var go = el("button", "btn btn-primary btn-lg", "Giriş Yap / Üye Ol");
        go.type = "button";
        go.addEventListener("click", identityOpen);
        state.appendChild(go);
        if (!identityReady) state.appendChild(el("p", "member-note", "Üyelik sistemi yapılandırılana kadar indirmeler açıktır."));
      }
      box.appendChild(state);
    }
    observeReveals(document);
  }

  /* --------------------------------------------------------
     Footer paylaşılan
     -------------------------------------------------------- */
  function renderFooterShared(data) {
    var s = data.settings || {};
    setText("footerTagline", s.tagline || (s.siteName || "MiceYama") + " — Türkçe oyun yama arşivi");
    setText("footerNote", s.footerNote || "");
    var fe = qs("#footerEmail");
    if (fe) {
      fe.textContent = s.email || "";
      if (s.email) fe.href = "mailto:" + s.email;
    }
  }

  /* ============================================================
     NAVBAR
     ============================================================ */
  function initNav() {
    var header = qs("#siteHeader");
    var toggle = qs("#navToggle");
    var links = qs("#navLinks");
    var page = pageName();

    if (header) {
      window.addEventListener("scroll", function () {
        header.classList.toggle("scrolled", window.scrollY > 12);
      }, { passive: true });
    }

    if (toggle && links) {
      function setMenu(open) {
        links.classList.toggle("open", open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      }
      toggle.addEventListener("click", function () { setMenu(!links.classList.contains("open")); });
      qsa("a", links).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    }

    // Aktif link
    qsa(".nav-link[data-page]").forEach(function (a) {
      if (a.getAttribute("data-page") === page) a.classList.add("is-active");
    });

    // Mobil drop toggle
    qsa(".nav-item > .nav-link").forEach(function (link) {
      link.addEventListener("click", function (e) {
        if (window.innerWidth <= 900) {
          var item = link.parentElement;
          if (link.classList.contains("has-drop")) e.preventDefault();
          item.classList.toggle("open");
        }
      });
    });
  }

  function fillNavDropdowns(data) {
    // Yamalar drop
    var drop = qs("#dropYamalar");
    if (drop) {
      drop.innerHTML = "";
      var head = el("div", "drop-head", "Kategoriler");
      drop.appendChild(head);
      var all = el("a", "", "Tüm Yamalar");
      all.href = "yamalar.html";
      drop.appendChild(all);
      (data.categories || []).forEach(function (c) {
        var a = el("a", "", c.name);
        a.href = "yamalar.html?k=" + encodeURIComponent(c.id);
        drop.appendChild(a);
      });
      if ((data.categories || []).length === 0) {
        var e = el("div", "drop-empty", "Kategori yakında");
        drop.appendChild(e);
      }
    }
    // Duyurular drop
    var drop2 = qs("#dropDuyurular");
    if (drop2) {
      drop2.innerHTML = "";
      var head2 = el("div", "drop-head", "Kategoriler");
      drop2.appendChild(head2);
      var all2 = el("a", "", "Tüm Duyurular");
      all2.href = "duyurular.html";
      drop2.appendChild(all2);
      (data.announcementCategories || []).forEach(function (c) {
        var a = el("a", "", c.name);
        a.href = "duyurular.html?k=" + encodeURIComponent(c.id);
        drop2.appendChild(a);
      });
      if ((data.announcementCategories || []).length === 0) {
        drop2.appendChild(el("div", "drop-empty", "Kategori yakında"));
      }
    }
  }

  /* ============================================================
     ÖZEL İMLEÇ + MANYETİK BUTONLAR
     ============================================================ */
  function initCursor() {
    var fine = window.matchMedia && window.matchMedia("(pointer: fine)");
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine || !fine.matches || (reduced && reduced.matches)) return;

    var dot = el("div", "cursor-dot");
    var ring = el("div", "cursor-ring");
    ring.appendChild(svgIcon(["M7 17L17 7", "M17 7H8", "M17 7v9"]));
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    var mx = -100, my = -100, rx = -100, ry = -100, raf = null;
    document.addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      if (!raf) {
        raf = requestAnimationFrame(function loop() {
          rx += (mx - rx) * 0.18;
          ry += (my - ry) * 0.18;
          dot.style.transform = "translate(" + (mx - 4) + "px," + (my - 4) + "px)";
          ring.style.transform = "translate(" + (rx - ring.offsetWidth / 2) + "px," + (ry - ring.offsetHeight / 2) + "px)";
          raf = null;
        });
      }
    });

    document.addEventListener("mousedown", function () { ring.classList.add("is-down"); });
    document.addEventListener("mouseup", function () { ring.classList.remove("is-down"); });
    document.addEventListener("mouseleave", function () { dot.style.opacity = "0"; ring.style.opacity = "0"; });
    document.addEventListener("mouseenter", function () { dot.style.opacity = "1"; ring.style.opacity = "1"; });

    var hoverSel = "a, button, .chip, summary, .nav-link, input, textarea, select, .game-cover";
    document.addEventListener("mouseover", function (e) {
      if (e.target.closest(hoverSel)) {
        dot.classList.add("is-hover");
        ring.classList.add("is-hover");
      }
    });
    document.addEventListener("mouseout", function (e) {
      if (e.target.closest(hoverSel)) {
        dot.classList.remove("is-hover");
        ring.classList.remove("is-hover");
      }
    });
  }

  function initMagnetic() {
    var fine = window.matchMedia && window.matchMedia("(pointer: fine)");
    if (!fine || !fine.matches) return;
    qsa(".btn, .chip, .nav-link").forEach(function (btn) {
      btn.addEventListener("mousemove", function (e) {
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.18;
        var y = (e.clientY - r.top - r.height / 2) * 0.22;
        btn.style.transform = "translate(" + x + "px," + y + "px)";
      });
      btn.addEventListener("mouseleave", function () { btn.style.transform = ""; });
    });
  }

  /* --------------------------------------------------------
     Görünüm animasyonları
     -------------------------------------------------------- */
  function observeReveals(scope) {
    var root = scope || document;
    if (!("IntersectionObserver" in window)) {
      qsa(".reveal", root).forEach(function (n) { n.classList.add("visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
    qsa(".reveal", root).forEach(function (n) { io.observe(n); });
  }

  function initPreloader() {
    var pre = qs("#preloader");
    if (!pre) return;
    setTimeout(function () { pre.classList.add("done"); }, 700);
  }

  /* --------------------------------------------------------
     Yeniden çizim (giriş/çıkış sonrası)
     -------------------------------------------------------- */
  function renderCurrent() {
    if (!CURRENT_DATA) return;
    var page = pageName();
    if (page === "archive") renderArchive(CURRENT_DATA);
    else if (page === "game") renderGame(CURRENT_DATA);
    else if (page === "duyurular") renderAnnouncements(CURRENT_DATA);
    else if (page === "blog") renderBlog(CURRENT_DATA);
    else if (page === "sosyal") renderSocial(CURRENT_DATA);
    else if (page === "uyelik") renderMembership(CURRENT_DATA);
    else renderHome(CURRENT_DATA);
  }

  /* --------------------------------------------------------
     Başlat
     -------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", function () {
    initPreloader();
    initNav();
    initCursor();
    initMagnetic();
    initIdentity();
    var page = pageName();
    loadData().then(function (data) {
      CURRENT_DATA = data;
      fillNavDropdowns(data);
      if (page === "archive") renderArchive(data);
      else if (page === "game") renderGame(data);
      else if (page === "duyurular") renderAnnouncements(data);
      else if (page === "blog") renderBlog(data);
      else if (page === "sosyal") renderSocial(data);
      else if (page === "uyelik") renderMembership(data);
      else renderHome(data);
    });
  });
})();
