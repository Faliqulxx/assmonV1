// ==UserScript==
// @name         Monev MagangHub - Isi Laporan dari PETRIK
// @namespace    https://assmonev.vercel.app/
// @version      1.0.0
// @description  Mengisi 3 kolom laporan (uraian, pembelajaran, kendala) dari draf yang dibawa PWA PETRIK. Tidak menekan Simpan dan Kirim, tidak mencentang pernyataan, dan tidak menyentuh lokasi.
// @match        https://monev.maganghub.kemnaker.go.id/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @updateURL    https://assmonev.vercel.app/monev-autofill.user.js
// @downloadURL  https://assmonev.vercel.app/monev-autofill.user.js
// ==/UserScript==

(function () {
  "use strict";

  var KEY = "monev_draft";
  var MAX_AGE_MS = 24 * 3600 * 1000;

  // 1) Tangkap draf dari URL hash (#monev=...) sebelum aplikasi portal / login SIAPkerja menimpanya.
  function decodeBase64Url(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  try {
    var m = location.hash.match(/monev=([A-Za-z0-9_-]+)/);
    if (m) {
      var parsed = JSON.parse(decodeBase64Url(m[1]));
      if (parsed && parsed.v === 1) {
        GM_setValue(KEY, JSON.stringify(parsed));
      }
      // Bersihkan hash dari address bar.
      history.replaceState(null, "", location.pathname + location.search);
    }
  } catch (e) {
    /* abaikan */
  }

  function getDraft() {
    try {
      var raw = GM_getValue(KEY, "");
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || Date.now() - (d.t || 0) > MAX_AGE_MS) return null;
      return d;
    } catch (e) {
      return null;
    }
  }

  // 2) Cari textarea berdasarkan label / placeholder.
  function textOf(el) {
    return ((el && el.textContent) || "").toLowerCase();
  }

  function fieldMatches(ta, words) {
    var hay = (ta.getAttribute("placeholder") || "").toLowerCase() + " " +
      (ta.getAttribute("aria-label") || "").toLowerCase() + " " +
      (ta.getAttribute("name") || "").toLowerCase();
    if (ta.id) {
      var lab = document.querySelector('label[for="' + ta.id + '"]');
      if (lab) hay += " " + textOf(lab);
    }
    var lb = ta.getAttribute("aria-labelledby");
    if (lb) {
      lb.split(/\s+/).forEach(function (id) {
        var n = document.getElementById(id);
        if (n) hay += " " + textOf(n);
      });
    }
    // Label bergaya "legend / outlined": naik beberapa level dan baca teks pendek.
    var p = ta.parentElement;
    for (var i = 0; i < 4 && p; i++, p = p.parentElement) {
      // Berhenti kalau induk sudah memuat textarea lain (label kolom lain ikut terbaca).
      if (p.querySelectorAll("textarea").length > 1) break;
      var t = textOf(p);
      if (t.length < 160) hay += " " + t;
    }
    return words.some(function (w) { return hay.indexOf(w) !== -1; });
  }

  function findTextareas() {
    var all = Array.prototype.slice.call(document.querySelectorAll("textarea"))
      .filter(function (t) { return !t.disabled && !t.readOnly && t.offsetParent !== null; });
    var uraian = all.filter(function (t) { return fieldMatches(t, ["uraian aktivitas", "uraian"]); })[0];
    var pembelajaran = all.filter(function (t) { return fieldMatches(t, ["pembelajaran"]); })[0];
    var kendala = all.filter(function (t) { return fieldMatches(t, ["kendala"]); })[0];
    // Cadangan: pakai urutan kemunculan jika label tidak terbaca.
    if (!uraian && all[0]) uraian = all[0];
    if (!pembelajaran && all[1]) pembelajaran = all[1];
    if (!kendala && all[2]) kendala = all[2];
    if (uraian === pembelajaran || pembelajaran === kendala || uraian === kendala) return null;
    return { uraian: uraian, pembelajaran: pembelajaran, kendala: kendala };
  }

  // 3) Set nilai agar terbaca oleh React (native setter + event input/change).
  function setReactValue(el, value) {
    var proto = Object.getPrototypeOf(el);
    var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  var panel, statusEl, filledOnce = false;

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function fill(force) {
    var d = getDraft();
    if (!d) {
      setStatus("Tidak ada draf. Buka portal dari tombol di Asisten Laporan.");
      return false;
    }
    var f = findTextareas();
    if (!f) {
      setStatus("Form laporan belum terbuka. Pilih tanggal dan buka Tambah laporan dulu.");
      return false;
    }
    var pairs = [
      [f.uraian, d.u],
      [f.pembelajaran, d.p],
      [f.kendala, d.k],
    ];
    var n = 0;
    pairs.forEach(function (pr) {
      if (!pr[0] || !pr[1]) return;
      if (!force && pr[0].value && pr[0].value.trim()) return; // jangan timpa isian Anda
      setReactValue(pr[0], pr[1]);
      n++;
    });
    if (n) {
      filledOnce = true;
      setStatus("Terisi " + n + " kolom. Periksa isinya, tambah lokasi, centang pernyataan, lalu kirim sendiri.");
    } else {
      setStatus("Kolom sudah berisi. Tekan lagi untuk menimpa.");
    }
    return n > 0;
  }

  function buildPanel() {
    if (panel || !document.body) return;
    panel = document.createElement("div");
    panel.style.cssText =
      "position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:260px;" +
      "background:#111827;color:#f1f5f9;border-radius:12px;padding:10px 12px;" +
      "font:12px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)";
    statusEl = document.createElement("div");
    statusEl.style.marginBottom = "8px";
    var btn = document.createElement("button");
    btn.textContent = "Isi dari draf";
    btn.style.cssText =
      "background:#2563eb;color:#fff;border:0;border-radius:8px;padding:8px 12px;" +
      "font:600 13px system-ui,sans-serif;width:100%";
    btn.addEventListener("click", function () { fill(true); });
    panel.appendChild(statusEl);
    panel.appendChild(btn);
    document.body.appendChild(panel);
    setStatus(getDraft() ? "Draf siap. Buka form Tambah laporan." : "Belum ada draf.");
  }

  // 4) Pantau halaman (SPA): saat form muncul dan kolom kosong, isi otomatis sekali.
  var timer = null;
  function onMutate() {
    buildPanel();
    if (filledOnce || timer) return;
    timer = setTimeout(function () {
      timer = null;
      if (getDraft() && findTextareas()) fill(false);
    }, 600);
  }

  function start() {
    var obs = new MutationObserver(onMutate);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    onMutate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
