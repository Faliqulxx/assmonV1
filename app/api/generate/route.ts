import { NextRequest, NextResponse } from "next/server";

interface ReportOutput {
  uraian: string;
  pembelajaran: string;
  kendala: string;
}

const DEFAULT_PROFIL = [
  "Perusahaan: PT Indospring Tbk, Gresik (anggota Indoprima Group), produsen pegas kendaraan: leaf spring, coil spring, dan stabilizer bar, dengan proses dingin dan panas. Memiliki fasilitas R&D, pengujian, dan desain.",
  "Visi: menjadi produsen suspensi dan rem yang terdepan dan terpercaya, dengan R&D yang inovatif dan mandiri.",
  "Misi: (1) menjadi produsen pegas otomotif berkualitas tinggi yang bereputasi, pemimpin pasar domestik, dan diakui secara global; (2) menciptakan peluang dengan mengembangkan individu yang berkomitmen tinggi dan memberi nilai tambah bagi perusahaan, masyarakat, dan bangsa.",
  "Nilai perusahaan (APIC): Adaption, Passion, Integrity, Commitment.",
].join("\n");

function getBounds(targetLen: number): { min: number; max: number; aim: number } {
  // Jika pengguna mengisi 100 (default), pastikan minimal 100 karakter dan ringkas (100-125 karakter)
  if (targetLen <= 100) {
    const min = Math.max(20, targetLen);
    return { min, max: min + 25, aim: min + 10 };
  }
  // Jika pengguna mengetik angka di atas 100 (misal 150, 200, 300), rentangnya 100 sampai angka tersebut
  return {
    min: 100,
    max: targetLen,
    aim: Math.max(105, targetLen - 10),
  };
}

function buildPrompt(
  deskripsi: string,
  style: string,
  targetLen: number,
  extra: string,
  profil: string
): string {
  const { min, max, aim } = getBounds(targetLen);
  const subj =
    style === "first"
      ? 'Gunakan sudut pandang orang pertama ("Saya ...").'
      : 'Jangan gunakan subjek; mulai kalimat dengan kata kerja (contoh: "Melakukan ...", "Menyusun ...").';

  return [
    "Kamu membantu menulis laporan kehadiran harian peserta magang (program MagangHub Kemnaker) yang magang di PT Indospring Tbk, Gresik, Jawa Timur, sebuah perusahaan manufaktur.",
    "Jangan mengarang divisi, produk, mesin, proses produksi, atau nama orang di perusahaan tersebut kecuali pengguna menyebutkannya sendiri.",
    "Pengguna memberikan satu deskripsi singkat yang mencakup kegiatan hari ini, hasil/pembelajaran, dan mungkin sedikit kendala.",
    "Tugasmu adalah memilah dan mengembangkan deskripsi singkat tersebut untuk mengisi 3 kolom laporan dalam Bahasa Indonesia formal yang wajar dan natural.",
    "",
    "DESKRIPSI SINGKAT PENGGUNA:",
    deskripsi,
    "",
    "PROFIL PERUSAHAAN (satu-satunya sumber fakta tentang perusahaan):",
    profil || "(kosong)",
    "",
    "ATURAN:",
    "1. Hanya kembangkan apa yang ada di deskripsi pengguna. DILARANG menambah kegiatan, angka, nama orang, nama aplikasi, atau fakta baru yang tidak disebut pengguna. Boleh menjelaskan konteks umum dan tujuan kegiatan secara netral.",
    "1a. Jika topik di deskripsi pengguna (misalnya 5R, visi, misi, nilai APIC) tercakup di PROFIL PERUSAHAAN, jelaskan topik itu dengan memakai isi profil dan kaitkan secara wajar dengan kegiatan pengguna. Sebut fakta perusahaan HANYA dari profil. Jangan menuliskan seluruh profil, ambil bagian yang relevan saja. Jika sebuah bagian profil bertanda konsep umum / bukan aturan internal, jangan menyebutnya sebagai aturan internal Indospring. Jika topik tidak ada di profil, JANGAN menjelaskan atau mengarang apa pun tentang perusahaan (termasuk definisi, aturan, atau prosedur internal seperti 5R); cukup tulis dari deskripsi pengguna, memakai istilah yang ia tulis apa adanya.",
    `2. Panjang tiap kolom WAJIB minimal ${min} karakter dan maksimal ${max} karakter (spasi ikut dihitung). Usahakan sekitar ${aim} karakter. Jangan memanjangkan dengan mengarang fakta; lebih baik singkat tetapi tepat di dalam rentang.`,
    '3. Pilah menjadi 3 kolom JSON: "uraian" (Kegiatan hari ini / Uraian aktivitas), "pembelajaran" (Hasil / pembelajaran yang diperoleh), dan "kendala" (Kendala yang dialami).',
    '4. Jika di dalam deskripsi pengguna tidak disebutkan adanya kendala/hambatan, tulis pada kolom "kendala" bahwa tidak terdapat kendala berarti dan kegiatan berjalan lancar, lalu tambahkan kalimat netral tentang upaya menjaga kelancaran kerja. Jangan mengarang kendala.',
    "5. Jika di dalam deskripsi pengguna belum disebutkan hasil/pembelajaran secara eksplisit, simpulkan pembelajaran yang relevan secara wajar dari kegiatan yang dilakukan tanpa menambah fakta baru.",
    "6. " + subj,
    "7. Tiga kolom harus berbeda isi dan fokus sesuai peruntukannya, tidak saling mengulang kalimat.",
    extra || "",
    "",
    'Balas hanya dengan JSON berisi kunci "uraian", "pembelajaran", "kendala".',
  ].join("\n");
}

async function callGemini(
  prompt: string,
  apiKey: string,
  model: string
): Promise<ReportOutput> {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            uraian: { type: "STRING" },
            pembelajaran: { type: "STRING" },
            kendala: { type: "STRING" },
          },
          required: ["uraian", "pembelajaran", "kendala"],
        },
      },
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    const msg =
      json?.error?.message ? json.error.message : "HTTP " + res.status;
    throw new Error("Gemini: " + msg);
  }

  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini tidak mengembalikan teks. Coba lagi.");
  }

  return JSON.parse(text) as ReportOutput;
}

function getLengths(o: ReportOutput): [number, number, number] {
  return [
    (o.uraian || "").trim().length,
    (o.pembelajaran || "").trim().length,
    (o.kendala || "").trim().length,
  ];
}

function isOutOfRange(o: ReportOutput, targetLen: number): boolean {
  const { min, max } = getBounds(targetLen);
  return getLengths(o).some((n) => n < min || n > max);
}

function buildFeedback(o: ReportOutput, targetLen: number): string {
  const { min, max } = getBounds(targetLen);
  const [l0, l1, l2] = getLengths(o);
  return (
    "8. KOREKSI: percobaan sebelumnya panjangnya uraian=" +
    l0 +
    ", pembelajaran=" +
    l1 +
    ", kendala=" +
    l2 +
    " karakter. Perbaiki yang kurang dari " +
    min +
    " (tambah konteks netral) atau lebih dari " +
    max +
    " (ringkas). Semua harus antara " +
    min +
    " dan " +
    max +
    " karakter."
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const deskripsi = (body.deskripsi || "").trim();
    const style = body.style || "first";
    const targetLen = Math.max(50, Math.min(1000, Number(body.maxLen) || 100));
    const model = (body.model || "gemini-2.5-flash").trim();
    const apiKey = (body.apiKey || process.env.GEMINI_API_KEY || "").trim();
    const profil = String(body.profil || DEFAULT_PROFIL).trim().slice(0, 4000);

    if (!deskripsi) {
      return NextResponse.json(
        { error: "Isi dulu deskripsi singkat kegiatan hari ini." },
        { status: 400 }
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "API key belum diisi. Buka ⚙ Pengaturan dan tempel Gemini API key (atau isi GEMINI_API_KEY di .env.local).",
        },
        { status: 400 }
      );
    }

    let extra = "";
    let lastResult: ReportOutput | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const prompt = buildPrompt(deskripsi, style, targetLen, extra, profil);
        const result = await callGemini(prompt, apiKey, model);
        lastResult = result;
        if (!isOutOfRange(result, targetLen) || attempt >= 2) {
          break;
        }
        extra = buildFeedback(result, targetLen);
      } catch (err) {
        if (lastResult) break;
        throw err;
      }
    }

    return NextResponse.json(lastResult);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
