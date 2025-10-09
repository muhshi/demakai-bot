/**
 * Centralized configuration untuk DemakAI
 * Mudah untuk update tanpa ubah code utama
 */

// ==================== SYNONYMS untuk Query Expansion ====================
export const SYNONYMS = {
  // Toko & Retail
  toko: ["toko", "warung", "kedai", "ritel", "took"],
  warung: ["warung", "kedai", "toko", "kios"],
  kedai: ["kedai", "warung", "toko"],
  ritel: ["ritel", "retail", "eceran"],

  // Usaha & Bisnis
  usaha: ["usaha", "bisnis", "dagang", "perniagaan"],
  bisnis: ["bisnis", "usaha", "perniagaan"],
  jualan: ["jualan", "jual", "dagang", "niaga"],
  dagang: ["dagang", "jualan", "perdagangan"],

  // Online & Digital
  online: ["online", "daring", "digital", "internet", "e-commerce"],
  daring: ["daring", "online", "digital"],
  digital: ["digital", "online", "daring", "elektronik"],

  // Makanan & Minuman
  makan: ["makan", "makanan", "kuliner", "restoran", "rumah makan"],
  makanan: ["makanan", "makan", "kuliner"],
  minum: ["minum", "minuman", "cafe", "kopi"],
  minuman: ["minuman", "minum", "beverage"],
  kopi: ["kopi", "cafe", "coffee", "kedai kopi"],
  cafe: ["cafe", "kopi", "coffee shop", "kedai kopi"],
  restoran: ["restoran", "rumah makan", "tempat makan"],

  // Jasa Umum
  fotokopi: ["fotokopi", "fotocopy", "penggandaan", "cetak", "copy"],
  cetak: ["cetak", "printing", "percetakan", "print"],
  laundry: ["laundry", "cuci", "binatu"],
  salon: ["salon", "pangkas", "cukur", "barbershop"],
  bengkel: ["bengkel", "reparasi", "service", "servis", "perbaikan"],

  // Pendidikan
  guru: ["guru", "pengajar", "pendidik", "dosen"],
  sekolah: ["sekolah", "pendidikan", "edukasi"],
  madrasah: ["madrasah", "diniyah", "pesantren"],
  kursus: ["kursus", "pelatihan", "training", "bimbel"],

  // IT & Teknologi
  programmer: ["programmer", "developer", "software engineer", "coding"],
  developer: ["developer", "programmer", "software engineer"],
  it: ["it", "teknologi informasi", "komputer", "teknologi"],
  komputer: ["komputer", "pc", "laptop", "computer"],
  software: ["software", "aplikasi", "program"],

  // Industri & Manufaktur
  konveksi: ["konveksi", "garmen", "jahit", "tekstil"],
  jahit: ["jahit", "menjahit", "tailor", "konveksi"],
  pabrik: ["pabrik", "manufaktur", "industri", "factory"],

  // Statistik & Data
  pdrb: ["pdrb", "produk domestik regional bruto", "pertumbuhan ekonomi"],
  data: ["data", "statistik", "informasi"],
  profil: ["profil", "gambaran", "overview"],
  ketenagakerjaan: ["ketenagakerjaan", "tenaga kerja", "pekerja"],
  kemiskinan: ["kemiskinan", "garis kemiskinan", "poverty"],
  inflasi: ["inflasi", "harga", "indeks harga"],
  demak: ["demak", "kabupaten demak"],

  // Tambahkan synonyms baru di bawah ini:
  // "kata_kunci": ["sinonim1", "sinonim2", ...],
};

// ==================== kamus ringkas topik publikasi ====================

export const PUB_KW = {
  pdrb: "produk domestik regional bruto ekonomi harga berlaku adhk pengeluaran lapangan usaha kabupaten demak bps",
  kemiskinan:
    "penduduk miskin tingkat kemiskinan garis kemiskinan gk tkem demak bps",
  inflasi:
    "inflasi indeks harga konsumen ihk perubahan harga konsumsi demak bps",
  tenaga:
    "ketenagakerjaan angkatan kerja tingkat partisipasi kerja tpak pengangguran demak bps",
  pendidikan:
    "pendidikan angka partisipasi sekolah aps lama sekolah apsr apk apm demak bps",
  kesehatan:
    "kesehatan stunting sanitasi gizi angka harapan hidup ahh demak bps",
  pertanian:
    "pertanian tanaman pangan hortikultura perkebunan peternakan produksi demak bps",
  perdagangan:
    "perdagangan ekspor impor neraca perdagangan harga produsen demak bps",
  pariwisata: "pariwisata kunjungan wisatawan hunian hotel amenitas demak bps",
};

// ==================== STOPWORDS Indonesia ====================
export const STOPWORDS = [
  // Kata hubung
  "yang",
  "dan",
  "di",
  "ke",
  "dari",
  "untuk",
  "dengan",
  "pada",

  // Kata tanya
  "apa",
  "bagaimana",
  "kenapa",
  "mengapa",
  "dimana",
  "kapan",

  // Kata ganti
  "saya",
  "aku",
  "kamu",
  "anda",
  "dia",
  "mereka",
  "kita",
  "ini",
  "itu",
  "tersebut",

  // Kata kerja umum
  "adalah",
  "ada",
  "mau",
  "ingin",
  "bisa",
  "akan",
  "sudah",
  "buka",
  "kerja",
  "sebagai",
  "jadi",

  // Imbuhan
  "nya",
  "lah",
  "kah",

  // Konjungsi
  "atau",
  "tapi",
  "tetapi",
  "jika",
  "kalau",
  "namun",

  // Tambahkan stopwords baru di sini
];

// ==================== SIMILARITY THRESHOLDS ====================
export const SIMILARITY_THRESHOLD = {
  kbli_kbji: 0.45,
  publikasi: 0.1,
};

// ==================== MAX RESULTS ====================
export const MAX_RESULTS = {
  kbli: 3, // Top 3 KBLI
  kbji: 3, // Top 3 KBJI
  publikasi: 8, // Top 8 chunks
  text_search: 20, // Fetch 20 dari DB, lalu filter
};

// ==================== MODE INDICATORS ====================
export const MODE_INDICATORS = {
  natural: "💬",
  kbli_kbji: "📋",
  publikasi: "📚",
};

// ==================== TIMEOUTS ====================
export const TIMEOUTS = {
  mode_idle: 15 * 60 * 1000, // 15 menit auto-reset mode
  session_inactive: 90, // 90 hari untuk cleanup
  ollama_request: 240000, // 240s timeout untuk Ollama
  embedding_retry_delay: 1000, // 1s base delay untuk retry
};

// ==================== LISTING KEYWORDS ====================
export const LISTING_KEYWORDS = [
  "apa saja",
  "daftar",
  "list",
  "semua publikasi",
  "ada apa",
  "tersedia",
  "tersedia apa",
  "punya apa",
  "katalog",
  "koleksi",
];

// ==================== GREETING PATTERNS ====================
export const GREETING_PATTERNS = [
  /^(hai|halo|hi|hello|hey|p|assalamualaikum|salam)/i,
  /^(selamat (pagi|siang|sore|malam))/i,
  /^(good (morning|afternoon|evening))/i,
];

// ==================== BOT BLACKLIST (Optional) ====================
// Tambahkan nomor bot yang harus di-ignore
export const BOT_BLACKLIST = [
  // "6281234567890@s.whatsapp.net",
  // Tambahkan nomor bot di sini
];

// ==================== CACHE CONFIG ====================
export const CACHE_CONFIG = {
  max_size: 1000,
  ttl: 24 * 60 * 60 * 1000, // 24 hours
};

// ==================== LLM CONFIG ====================
export const LLM_CONFIG = {
  temperature: 0.7,
  top_p: 0.9,
  max_tokens: 320,
  context_window: 5, // Last 5 messages
  history_max: 10, // Keep max 10 messages
};

export const TOP_LIMITS = {
  KBLI: 5, // ambil maksimal 5 hasil KBLI
  KBJI: 5, // ambil maksimal 5 hasil KBJI
  PUBLIKASI: 10, // ambil maksimal 10 publikasi (chunks)
};
