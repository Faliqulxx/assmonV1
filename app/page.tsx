"use client";

import React, { useState, useEffect, useRef } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type OutputTab = "uraian" | "pembelajaran" | "kendala";

const PORTAL_URL = "https://monev.maganghub.kemnaker.go.id/";

// Encode teks (UTF-8) ke base64url supaya aman ditaruh di URL hash.
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function getLS(key: string, defaultVal: string): string {
  if (typeof window === "undefined") return defaultVal;
  try {
    const v = localStorage.getItem(key);
    return v === null ? defaultVal : v;
  } catch {
    return defaultVal;
  }
}

function setLS(key: string, val: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, val);
  } catch {
    // ignore storage errors
  }
}

function clampLen(v: string | number): number {
  const n = typeof v === "number" ? v : parseInt(v, 10);
  if (isNaN(n) || n <= 0) return 100;
  return Math.max(50, Math.min(1000, n));
}

export default function HomePage() {
  const [today, setToday] = useState<string>("");

  // Single unified input description
  const [deskripsi, setDeskripsi] = useState<string>("");

  // 3 Output columns filled automatically from the description
  const [uraian, setUraian] = useState<string>("");
  const [pembelajaran, setPembelajaran] = useState<string>("");
  const [outKendala, setOutKendala] = useState<string>("");

  // Active output tab
  const [activeTab, setActiveTab] = useState<OutputTab>("uraian");

  // Target character length (typed only, default 100)
  const [maxLen, setMaxLen] = useState<number>(100);
  const [maxInput, setMaxInput] = useState<string>("100");

  // Settings
  const [apiKey, setApiKey] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);
  const [model, setModel] = useState<string>("gemini-2.5-flash");
  const [style, setStyle] = useState<string>("first");

  // PWA Install states
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(true);
  const [isIOS, setIsIOS] = useState<boolean>(false);

  // UI states
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string>("");
  const [toastMsg, setToastMsg] = useState<string>("");
  const [toastVisible, setToastVisible] = useState<boolean>(false);

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const iosDialogRef = useRef<HTMLDialogElement | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    );

    // Load saved drafts & settings from localStorage
    setDeskripsi(getLS("draft_in-deskripsi", ""));
    setUraian(getLS("draft_out-uraian", ""));
    setPembelajaran(getLS("draft_out-pembelajaran", ""));
    setOutKendala(getLS("draft_out-kendala", ""));

    const savedMax = clampLen(getLS("target_len", "100"));
    setMaxLen(savedMax);
    setMaxInput(String(savedMax));

    setApiKey(getLS("gemini_key", ""));
    setModel(getLS("gemini_model", "gemini-2.5-flash"));
    setStyle(getLS("style", "first"));

    // Check standalone / iOS status
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as unknown as { standalone?: boolean }).standalone);
    setIsStandalone(standalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    // Listen for Android/Chrome PWA install prompt
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    // Register Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
    }, 1800);
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      iosDialogRef.current?.showModal();
    }
  };

  const handleSetMax = (val: string | number) => {
    const m = clampLen(val);
    setMaxLen(m);
    setMaxInput(String(m));
    setLS("target_len", String(m));
  };

  const copyText = async (text: string, id: string) => {
    if (!text.trim()) {
      showToast("Belum ada teks untuk disalin");
      return;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("Copy failed");
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(""), 1600);
      showToast("Berhasil disalin ke clipboard");
    } catch {
      showToast("Gagal menyalin teks");
    }
  };

  // Buka portal; draf ikut dibawa lewat URL hash (tidak dikirim ke server mana pun)
  // supaya userscript di halaman portal bisa mengisi 3 kolom.
  const openPortal = (withDraft: boolean) => {
    let url = PORTAL_URL;
    if (withDraft && (uraian.trim() || pembelajaran.trim() || outKendala.trim())) {
      const payload = JSON.stringify({
        v: 1,
        u: uraian.trim(),
        p: pembelajaran.trim(),
        k: outKendala.trim(),
        t: Date.now(),
      });
      url += "#monev=" + toBase64Url(payload);
    }
    window.open(url, "_blank", "noopener");
  };

  const getCountInfo = (text: string) => {
    const n = text.trim().length;
    const min = maxLen <= 100 ? maxLen : 100;
    const max = maxLen <= 100 ? maxLen + 25 : maxLen;
    const pct = Math.min(100, Math.round((n / max) * 100));

    if (n === 0) {
      return {
        txt: `0 / ${maxLen} karakter`,
        cls: "",
        pct: 0,
      };
    }
    let txt = `${n} / ${maxLen} karakter`;
    let cls = "ok";
    if (n < min) {
      cls = "bad";
      txt = `${n} karakter (kurang ${min - n})`;
    } else if (n > max) {
      cls = "warn";
      txt = `${n} karakter (+${n - max} lewat batas)`;
    } else {
      txt = `${n} karakter • Pas`;
    }
    return { txt, cls, pct };
  };

  const handleSaveSettings = () => {
    const trimmedKey = apiKey.trim();
    const trimmedModel = model.trim() || "gemini-2.5-flash";
    setApiKey(trimmedKey);
    setModel(trimmedModel);
    setLS("gemini_key", trimmedKey);
    setLS("gemini_model", trimmedModel);
    setLS("style", style);
    dialogRef.current?.close();
    showToast("Pengaturan berhasil disimpan");
  };

  const handleClearAll = () => {
    setDeskripsi("");
    setUraian("");
    setPembelajaran("");
    setOutKendala("");
    setLS("draft_in-deskripsi", "");
    setLS("draft_out-uraian", "");
    setLS("draft_out-pembelajaran", "");
    setLS("draft_out-kendala", "");
    setError("");
    showToast("Catatan & hasil dibersihkan");
  };

  const generate = async () => {
    const d = deskripsi.trim();

    if (!d) {
      setError("Isi dulu deskripsi singkat kegiatan hari ini.");
      return;
    }

    const currentLen = clampLen(maxInput);
    handleSetMax(currentLen);

    setError("");
    setBusy(true);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deskripsi: d,
          style,
          maxLen: currentLen,
          apiKey,
          model,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const nextUraian = (data.uraian || "").trim();
      const nextPembelajaran = (data.pembelajaran || "").trim();
      const nextKendala = (data.kendala || "").trim();

      setUraian(nextUraian);
      setPembelajaran(nextPembelajaran);
      setOutKendala(nextKendala);

      setLS("draft_out-uraian", nextUraian);
      setLS("draft_out-pembelajaran", nextPembelajaran);
      setLS("draft_out-kendala", nextKendala);

      setActiveTab("uraian");
      showToast("3 kolom laporan berhasil dibuat");
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 60);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const hasResult = Boolean(
    uraian.trim() || pembelajaran.trim() || outKendala.trim()
  );
  const canShowInstall = !isStandalone && (Boolean(deferredPrompt) || isIOS);

  const tabConfig: Record<
    OutputTab,
    {
      title: string;
      placeholder: string;
      value: string;
      onChange: (v: string) => void;
    }
  > = {
    uraian: {
      title: "Kegiatan hari ini",
      placeholder: "Kolom uraian aktivitas akan terisi otomatis di sini...",
      value: uraian,
      onChange: (v) => {
        setUraian(v);
        setLS("draft_out-uraian", v);
      },
    },
    pembelajaran: {
      title: "Hasil Pembelajaran",
      placeholder: "Kolom hasil/pembelajaran akan terisi otomatis di sini...",
      value: pembelajaran,
      onChange: (v) => {
        setPembelajaran(v);
        setLS("draft_out-pembelajaran", v);
      },
    },
    kendala: {
      title: "Kendala yang dialami",
      placeholder: "Kolom kendala akan terisi otomatis di sini...",
      value: outKendala,
      onChange: (v) => {
        setOutKendala(v);
        setLS("draft_out-kendala", v);
      },
    },
  };

  const currentTab = tabConfig[activeTab];
  const currentCount = getCountInfo(currentTab.value);

  return (
    <>
      <header>
        <div className="header-inner">
          <div className="brand">
            <div className="brand-icon" aria-hidden="true">
              <img src="/icon-192.png" alt="PETRIK" width={42} height={42} />
            </div>
            <div className="brand-text">
              <h1>PETRIK</h1>
              <span>Your AI Activity Report Assistant</span>
            </div>
          </div>

          <div className="header-actions">
            {canShowInstall && (
              <button
                type="button"
                className="icon-btn install-btn"
                onClick={handleInstallClick}
                aria-label="Unduh Aplikasi ke HP"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Install</span>
              </button>
            )}

            <button
              type="button"
              className="icon-btn"
              onClick={() => dialogRef.current?.showModal()}
              aria-label="Pengaturan API & Model"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Pengaturan</span>
              <svg
                className="chev"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* Top Meta Pills */}
        <div className="top-meta">
          <div className="date-pill">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>{today || "Memuat tanggal..."}</span>
          </div>

          <button
            type="button"
            onClick={() => dialogRef.current?.showModal()}
            className={`key-badge ${apiKey.trim() ? "ready" : "missing"}`}
          >
            <span className="status-dot" aria-hidden="true" />
            <span>
              {apiKey.trim()
                ? `Model: ${model || "gemini-2.5-flash"}`
                : "API Key belum diatur"}
            </span>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.75 }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
        </div>

        {/* Hero Section */}
        <section className="hero">
          <div className="hero-copy">
            <h2 className="hero-title">
              Ceritakan Kegiatanmu,
              <br />
              Kami Buat <span className="hero-accent">Laporannya!</span>
            </h2>
            <p className="hero-sub">
              Tulis kegiatan hari ini, dan biarkan PETRIK membantu merangkum
              menjadi laporan yang rapi dan profesional.
            </p>
          </div>

          <div className="hero-art" aria-hidden="true">
            <svg
              viewBox="0 0 220 180"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="hero-svg"
            >
              <defs>
                <linearGradient id="cardGrad" x1="35" y1="20" x2="155" y2="150" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#e0e7ff" />
                  <stop offset="55%" stopColor="#a5b4fc" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
                <linearGradient id="cardEdge" x1="35" y1="145" x2="145" y2="160" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#4338ca" />
                </linearGradient>
                <linearGradient id="penGrad" x1="125" y1="130" x2="188" y2="62" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#312e81" />
                  <stop offset="45%" stopColor="#4f46e5" />
                  <stop offset="100%" stopColor="#818cf8" />
                </linearGradient>
                <linearGradient id="orbitGrad" x1="20" y1="120" x2="200" y2="65" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.1" />
                  <stop offset="50%" stopColor="#818cf8" stopOpacity="0.65" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.1" />
                </linearGradient>
                <filter id="glowBlur" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="12" result="blur" />
                </filter>
              </defs>

              {/* Soft ambient glow behind illustration */}
              <ellipse cx="115" cy="95" rx="72" ry="52" fill="#4f46e5" opacity="0.28" filter="url(#glowBlur)" />

              {/* Orbit ring */}
              <ellipse
                cx="112"
                cy="104"
                rx="82"
                ry="30"
                transform="rotate(-14 112 104)"
                stroke="url(#orbitGrad)"
                strokeWidth="1.6"
              />

              {/* Tilted 3D Checklist Card */}
              <g transform="rotate(9 102 88)">
                {/* Card bottom thickness */}
                <rect x="48" y="34" width="104" height="118" rx="18" fill="url(#cardEdge)" />
                {/* Card top face */}
                <rect x="48" y="26" width="104" height="118" rx="18" fill="url(#cardGrad)" />

                {/* Checkboxes & lines */}
                <rect x="64" y="46" width="16" height="16" rx="5" fill="#4f46e5" />
                <path d="M68.5 54.2L71.2 56.8L76 51.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="88" y="50" width="46" height="7" rx="3.5" fill="#6366f1" opacity="0.55" />

                <rect x="64" y="74" width="16" height="16" rx="5" fill="#4f46e5" />
                <path d="M68.5 82.2L71.2 84.8L76 79.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="88" y="78" width="42" height="7" rx="3.5" fill="#6366f1" opacity="0.55" />
                <rect x="88" y="89" width="28" height="5" rx="2.5" fill="#6366f1" opacity="0.32" />

                <rect x="64" y="102" width="16" height="16" rx="5" fill="#4f46e5" />
                <path d="M68.5 110.2L71.2 112.8L76 107.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="88" y="106" width="38" height="7" rx="3.5" fill="#6366f1" opacity="0.55" />
              </g>

              {/* 3D Stylus Pen */}
              <g transform="rotate(42 158 98)">
                <rect x="148" y="52" width="19" height="78" rx="9.5" fill="url(#penGrad)" />
                <rect x="151" y="57" width="4" height="62" rx="2" fill="#c7d2fe" opacity="0.45" />
                <path d="M148 124L157.5 144L167 124Z" fill="#312e81" />
                <path d="M154.5 137L157.5 144L160.5 137Z" fill="#1e1b4b" />
              </g>

              {/* Sparkles */}
              <path d="M36 42L38.5 48.5L45 51L38.5 53.5L36 60L33.5 53.5L27 51L33.5 48.5Z" fill="#93c5fd" />
              <path d="M188 134L190 139.5L195.5 141.5L190 143.5L188 149L186 143.5L180.5 141.5L186 139.5Z" fill="#60a5fa" />
              <circle cx="24" cy="76" r="2.2" fill="#818cf8" opacity="0.8" />
              <circle cx="192" cy="54" r="2.5" fill="#a5b4fc" opacity="0.7" />
            </svg>
          </div>
        </section>

        {/* Card 1: Form Laporan Kegiatan */}
        <section className="card">
          <div className="section-head">
            <div className="section-head-left">
              <div className="section-badge" aria-hidden="true">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <div>
                <h2 className="section-title">Form Laporan Kegiatan</h2>
                <p className="section-sub">
                  Isi informasi kegiatan harianmu dengan detail dan jelas.
                </p>
              </div>
            </div>

            {(deskripsi || hasResult) && (
              <button
                type="button"
                className="btn ghost small"
                onClick={handleClearAll}
              >
                Bersihkan
              </button>
            )}
          </div>

          <div className="field">
            <label htmlFor="in-deskripsi" className="icon-label">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span>Ceritakan Kegiatan Hari Ini</span>
            </label>
            <textarea
              id="in-deskripsi"
              rows={3}
              value={deskripsi}
              onChange={(e) => {
                setDeskripsi(e.target.value);
                setLS("draft_in-deskripsi", e.target.value);
              }}
              placeholder="Contoh: Hari ini ikut rapat tim dan bantu rekap laporan bulanan pakai Excel pivot, hasilnya jadi paham alur pelaporan, kendalanya ada beberapa data yang belum lengkap."
            />
          </div>

          <div className="field">
            <label htmlFor="in-max" className="icon-label">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
              <span>Target Panjang Tiap Kolom</span>
            </label>
            <div className="input-with-unit">
              <input
                id="in-max"
                type="number"
                inputMode="numeric"
                min={50}
                max={1000}
                step={1}
                value={maxInput}
                onChange={(e) => setMaxInput(e.target.value)}
                onBlur={() => handleSetMax(maxInput)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSetMax(maxInput);
                }}
                placeholder="100"
              />
              <span className="input-unit-pill">karakter</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="quick-style" className="icon-label">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Gaya Bahasa Laporan</span>
            </label>
            <div className="select-wrap">
              <svg
                className="select-lead-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 2l2.1 6.2L20 10.3l-5.9 2.1L12 18.6l-2.1-6.2L4 10.3l5.9-2.1L12 2z" />
              </svg>
              <select
                id="quick-style"
                value={style}
                onChange={(e) => {
                  setStyle(e.target.value);
                  setLS("style", e.target.value);
                }}
              >
                <option value="first">
                  Orang pertama (&quot;Saya melakukan...&quot;)
                </option>
                <option value="none">
                  Tanpa subjek (&quot;Melakukan...&quot;)
                </option>
              </select>
              <svg
                className="select-chev"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          <button className="btn btn-cta" onClick={generate} disabled={busy}>
            <span className="btn-cta-center">
              {busy ? (
                <>
                  <span className="spinner" />
                  <span>Merangkai 3 kolom laporan...</span>
                </>
              ) : (
                <>
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span>Buat Laporan</span>
                </>
              )}
            </span>
            {!busy && (
              <svg
                className="btn-arrow"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            )}
          </button>

          {error && <div className="error-banner">{error}</div>}
        </section>

        {/* Card 2: Hasil Laporan (Tabbed) */}
        <section className="card results-card" ref={resultsRef}>
          <div className="outputs-header">
            <div className="outputs-title-wrap">
              <svg
                className="outputs-icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="3" y="10" width="4" height="11" rx="1.5" />
                <rect x="10" y="4" width="4" height="17" rx="1.5" />
                <rect x="17" y="13" width="4" height="8" rx="1.5" />
              </svg>
              <h2>Hasil Laporan</h2>
            </div>

            <div className="outputs-actions">
              {hasResult && (
                <span className="done-pill">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="16 9 10.5 14.5 8 12" />
                  </svg>
                  <span>Berhasil dibuat</span>
                </span>
              )}

              <button
                type="button"
                className="btn ghost small"
                onClick={generate}
                disabled={busy || !deskripsi.trim()}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                <span>Buat Variasi Lain</span>
              </button>
            </div>
          </div>

          {/* 3-Tab Segmented Selector */}
          <div className="tabs-bar" role="tablist" aria-label="Kolom hasil laporan">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "uraian"}
              className={`tab-btn ${activeTab === "uraian" ? "active" : ""}`}
              onClick={() => setActiveTab("uraian")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <polyline points="9 14 11 16 15 12" />
              </svg>
              <span className="tab-text">
                <strong>Kegiatan</strong>
                <small>hari ini</small>
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "pembelajaran"}
              className={`tab-btn ${activeTab === "pembelajaran" ? "active" : ""}`}
              onClick={() => setActiveTab("pembelajaran")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              <span className="tab-text">
                <strong>Hasil /</strong>
                <small>pembelajaran</small>
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "kendala"}
              className={`tab-btn ${activeTab === "kendala" ? "active" : ""}`}
              onClick={() => setActiveTab("kendala")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="tab-text">
                <strong>Kendala</strong>
                <small>yang dialami</small>
              </span>
            </button>
          </div>

          {/* Active Tab Panel */}
          <div className="output-panel" role="tabpanel">
            <div className="output-panel-head">
              <div className="output-panel-title">
                <svg
                  className="sparkle-icon"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 2l2.1 6.2L20 10.3l-5.9 2.1L12 18.6l-2.1-6.2L4 10.3l5.9-2.1L12 2z" />
                </svg>
                <label htmlFor="out-active">{currentTab.title}</label>
              </div>
              <span className={`count-pill ${currentCount.cls}`}>
                {currentCount.txt}
              </span>
            </div>

            <textarea
              id="out-active"
              rows={4}
              value={currentTab.value}
              onChange={(e) => currentTab.onChange(e.target.value)}
              placeholder={currentTab.placeholder}
            />

            <div className="progress-track">
              <div
                className={`progress-fill ${currentCount.cls}`}
                style={{ width: `${currentCount.pct}%` }}
              />
            </div>

            <button
              type="button"
              className={`btn copy-panel-btn ${
                copiedId === activeTab ? "copied" : ""
              }`}
              onClick={() => copyText(currentTab.value, activeTab)}
            >
              {copiedId === activeTab ? (
                <>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>Tersalin</span>
                </>
              ) : (
                <>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  <span>Salin Hasil</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Footer Divider */}
        <footer className="footer-divider">
          <span className="divider-line" aria-hidden="true" />
          <span className="footer-label">
            Crafted by <strong>FREEKS</strong>
          </span>
          <span className="divider-line" aria-hidden="true" />
        </footer>

        {/* Bottom Portal Action Button */}
        <button
          type="button"
          className="btn portal-pill-btn"
          onClick={() => openPortal(true)}
        >
          <span className="btn-cta-center">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <span>Buka Portal &amp; Bawa Draf</span>
          </span>
          <svg
            className="btn-arrow"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </main>

      {/* Modal Pengaturan AI */}
      <dialog ref={dialogRef}>
        <div className="dialog-head">
          <h2>Pengaturan AI</h2>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => dialogRef.current?.close()}
            aria-label="Tutup"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="field">
          <label htmlFor="s-key">Gemini API Key</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              id="s-key"
              type={showKey ? "text" : "password"}
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Tempel API key Gemini Anda di sini"
            />
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? "Sembunyi" : "Lihat"}
            </button>
          </div>
          <p className="hint">
            Dapatkan gratis di{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--primary)", fontWeight: 600 }}
            >
              aistudio.google.com/apikey
            </a>
            . Disimpan aman di browser perangkat ini.
          </p>
        </div>

        <div className="field">
          <label htmlFor="s-model">Model Gemini</label>
          <input
            id="s-model"
            type="text"
            autoComplete="off"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gemini-2.5-flash"
          />
          <p className="hint">
            Default: <code>gemini-2.5-flash</code>. Bisa diganti jika model
            sedang penuh.
          </p>
        </div>

        <div className="dialog-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => dialogRef.current?.close()}
          >
            Batal
          </button>
          <button type="button" className="btn btn-cta" onClick={handleSaveSettings}>
            Simpan Pengaturan
          </button>
        </div>
      </dialog>

      {/* Modal Panduan Install di iPhone / iOS */}
      <dialog ref={iosDialogRef}>
        <div className="dialog-head">
          <h2>Pasang di iPhone / iPad</h2>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => iosDialogRef.current?.close()}
            aria-label="Tutup"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <p style={{ fontSize: "14px", margin: "0 0 12px" }}>
          Untuk mengunduh aplikasi ini ke layar utama iPhone/iPad Anda:
        </p>
        <ol style={{ fontSize: "14px", paddingLeft: "20px", margin: 0 }}>
          <li style={{ marginBottom: "8px" }}>
            Ketuk tombol <strong>Bagikan (Share)</strong> di bagian bawah
            browser Safari.
          </li>
          <li>
            Pilih <strong>&quot;Tambahkan ke Layar Utama&quot; (Add to Home Screen)</strong>.
          </li>
        </ol>
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-cta"
            onClick={() => iosDialogRef.current?.close()}
          >
            Mengerti
          </button>
        </div>
      </dialog>

      <div className={`toast ${toastVisible ? "show" : ""}`}>{toastMsg}</div>
    </>
  );
}
