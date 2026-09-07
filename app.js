/**
 * SMART FINDER KIOSK - EUREKA BOOKHOUSE
 * Logika Utama Aplikasi Kiosk Touchscreen (Offline-First)
 * Versi: 2.0.0
 */

// ==========================================
// 1. KONFIGURASI & KONSTANTA
// ==========================================
const GSHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRBWrbVyFoA9HnDUmlfLIX_oCs1RgttGGTLDTW_tQPeN-HSy6ahb_84GTndjBdlb00X4mP_E5jZ5XsA/pub?gid=1241656442&single=true&output=csv";

const DEFAULT_COVER_PLACEHOLDER = "assets/images/book-placeholder.svg";
const IDLE_RESET_TIMEOUT_SEC = 60; // Reset otomatis ke halaman awal jika user idle 60 detik
const AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000; // Sinkronisasi otomatis latar belakang setiap 10 menit
const DEBOUNCE_WAIT_MS = 800; // Jeda debounce pencarian

// Definisi Filter Pills Kata Kunci (Multi-Select)
const FILTER_OPTIONS = [
  { id: "title", label: "Judul Buku", icon: "book" },
  { id: "sku", label: "SKU / ISBN", icon: "barcode" },
  { id: "author", label: "Pengarang", icon: "user" },
  { id: "publisher", label: "Penerbit", icon: "building" },
];

// ==========================================
// KONFIGURASI BANNER PROMOSI (CAROUSEL EMPTY STATE)
// Format URL Direct Google Drive: https://lh3.googleusercontent.com/d/FILE_ID
// ==========================================
const PROMO_BANNERS = [
  {
    id: 1,
    title: "",
    image:
      "https://lh3.googleusercontent.com/d/1uXvfCis50X0aOW_F19T94VjxQmCmun6h",
  },
  {
    id: 2,
    title: "",
    image:
      "https://lh3.googleusercontent.com/d/1Vgs196M_6HdzVCb2UaGhO2kGnZWqzefo",
  },
  {
    id: 3,
    title: "",
    image:
      "https://lh3.googleusercontent.com/d/1RqXnzxHCRqzBGMCp6S6Mkx210_v0t76_",
  },
];

const PROMO_AUTOSLIDE_INTERVAL_MS = 5000;
let currentPromoSlide = 0;
let promoAutoSlideTimer = null;

// ==========================================
// 2. STATE MANAGEMENT
// ==========================================
let BOOK_DATABASE = [];
let activeFilters = new Set(["title"]); // Default aktif: judul
let currentResults = [];
let selectedBookId = null;
let debounceTimer = null;
let lastActivityTimestamp = Date.now();
let isShowingAll = false;
let isQuizFilterActive = false;

// ==========================================
// 3. REFERENSI ELEMEN DOM
// ==========================================
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const booksTable = document.getElementById("booksTable");
const booksTableBody = document.getElementById("booksTableBody");
const emptyState = document.getElementById("emptyState");
const emptyStateTitle = document.getElementById("emptyStateTitle");
const emptyStateDesc = document.getElementById("emptyStateDesc");
const loadingState = document.getElementById("loadingState");
const resultCountBadge = document.getElementById("resultCountBadge");
const filterPillsContainer = document.getElementById("filterPillsContainer");
const sheetStatusBadge = document.getElementById("sheetStatusBadge");
const tableContainer = document.getElementById("tableContainer");

// Filter Dropdown DOMs & State
const resetDropdownsBtn = document.getElementById("resetDropdownsBtn");

let selectedDropdownFilters = {
  publisher: "",
  category: "",
  shelf: "",
};
let dropdownRawData = {
  publisher: [],
  category: [],
  shelf: [],
};
let activeOpenDropdown = null;
let deferredPwaPrompt = null;

// Panel Detail Kanan DOMs
const noSelectionState = document.getElementById("noSelectionState");
const bookDetailContent = document.getElementById("bookDetailContent");
const detailShelfCode = document.getElementById("detailShelfCode");
const detailFloor = document.getElementById("detailFloor");
const detailCover = document.getElementById("detailCover");
const detailTitle = document.getElementById("detailTitle");
const detailIsbnUnderTitle = document.getElementById("detailIsbnUnderTitle");
const detailPriceBadge = document.getElementById("detailPriceBadge");
const detailStockBadge = document.getElementById("detailStockBadge");
const detailPrice = document.getElementById("detailPrice");
const detailBookNonBook = document.getElementById("detailBookNonBook");
const detailCategoryCode = document.getElementById("detailCategoryCode");
const detailCategory1 = document.getElementById("detailCategory1");
const detailCategory2 = document.getElementById("detailCategory2");
const detailAuthorSpec = document.getElementById("detailAuthorSpec");
const detailPublisher = document.getElementById("detailPublisher");
const detailSku = document.getElementById("detailSku");
const detailProductCode = document.getElementById("detailProductCode");
const detailSynopsis = document.getElementById("detailSynopsis");

// ==========================================
// 4. HELPER UTILITIES
// ==========================================
function formatRupiah(val) {
  if (val === null || val === undefined || val === "") return "Rp 0";
  const num =
    typeof val === "number"
      ? val
      : parseInt(String(val).replace(/[^0-9]/g, ""));
  if (isNaN(num)) return "Rp 0";
  return "Rp " + num.toLocaleString("id-ID");
}

function formatFloor(floorVal) {
  if (
    !floorVal ||
    String(floorVal).trim() === "-" ||
    String(floorVal).trim() === ""
  ) {
    return "Lantai 1";
  }
  const clean = String(floorVal).trim();
  if (clean.toLowerCase().startsWith("lantai")) {
    return clean;
  }
  return `Lantai ${clean}`;
}

// ==========================================
// 5. INISIALISASI APLIKASI
// ==========================================
window.addEventListener("DOMContentLoaded", () => {
  renderFilterPills();
  setupVirtualKeyboard();
  initPromoBannerCarousel();
  if (window.lucide) {
    lucide.createIcons();
  }

  // 1. Muat Cache Lokal Terlebih Dahulu (Start 0-detik Offline)
  loadCachedDataIfExists();

  // 2. Muat data live dari Google Sheets di latar belakang
  loadDataFromGSheet();

  // 3. Sinkronisasi berkala setiap 10 menit
  setInterval(() => {
    loadDataFromGSheet(true);
  }, AUTO_SYNC_INTERVAL_MS);

  // 4. Pasang pendeteksi idle Kiosk
  setupKioskIdleReset();

  // 5. Pasang listener input keyboard
  searchInput.addEventListener("input", onInputChanged);

  // 6. Inisialisasi tampilan awal tabel
  renderTable([]);

  // 7. Listener klik di luar untuk menutup custom dropdown
  window.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-dropdown")) {
      closeAllCustomDropdowns();
    }
  });

  // 8. Pasang listener infinite scroll pada tabel
  if (tableContainer) {
    tableContainer.addEventListener("scroll", () => {
      if (renderedBatchCount >= currentResults.length) return;
      const { scrollTop, scrollHeight, clientHeight } = tableContainer;
      if (scrollTop + clientHeight >= scrollHeight - 120) {
        renderNextBatch();
      }
    });
  }

  // 9. Daftarkan Service Worker PWA untuk offline caching
  registerServiceWorker();

  // 10. Fokuskan kursor ke input pencarian
  setTimeout(() => {
    if (searchInput) searchInput.focus();
  }, 200);
});

// ==========================================
// 6. SERVICE WORKER REGISTRATION (OFFLINE CACHE)
// ==========================================

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js")
        .then((reg) => {
          console.log("[Kiosk SW] Service Worker aktif:", reg.scope);
        })
        .catch((err) => {
          console.warn("[Kiosk SW] Registrasi Service Worker gagal:", err);
        });
    });
  }
}

// ==========================================
// 7. STATUS BADGE & LOCAL CACHE ENGINE
// ==========================================
function updateSheetStatusBadge(status, count = 0) {
  if (!sheetStatusBadge) return;

  if (status === "loading") {
    sheetStatusBadge.className =
      "text-[11px] font-medium px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 flex items-center gap-1.5 border border-slate-200 cursor-pointer select-none";
    sheetStatusBadge.title =
      "Sedang menyinkronkan data dengan Google Sheets...";
    sheetStatusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span> Memuat Data...`;
  } else if (status === "live") {
    sheetStatusBadge.className =
      "text-[11px] font-medium px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 flex items-center gap-1.5 border border-emerald-200 cursor-pointer select-none hover:bg-emerald-100 transition active:scale-95";
    sheetStatusBadge.title =
      "Data terhubung langsung ke Google Sheets. Klik untuk sinkronkan ulang.";
    sheetStatusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500"></span> ${count.toLocaleString("id-ID")} Buku Terhubung`;
  } else if (status === "cached") {
    sheetStatusBadge.className =
      "text-[11px] font-medium px-2.5 py-1 rounded-md bg-sky-50 text-sky-700 flex items-center gap-1.5 border border-sky-200 cursor-pointer select-none hover:bg-sky-100 transition active:scale-95";
    sheetStatusBadge.title =
      "Menggunakan data cache lokal. Klik untuk mencoba hubungkan ke live sheet.";
    sheetStatusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-sky-500"></span> ${count.toLocaleString("id-ID")} Buku (Offline/Cache)`;
  } else {
    sheetStatusBadge.className =
      "text-[11px] font-medium px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 flex items-center gap-1.5 border border-rose-200 cursor-pointer select-none hover:bg-rose-100 transition active:scale-95";
    sheetStatusBadge.title =
      "Gagal memuat data live. Klik untuk mencoba kembali.";
    sheetStatusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-rose-500"></span> Gagal Koneksi (Klik Coba Lagi)`;
  }
}

function loadCachedDataIfExists() {
  try {
    const cachedCsv = localStorage.getItem("kiosk_book_csv");
    if (cachedCsv && cachedCsv.length > 50) {
      const parsed = parseCSV(cachedCsv);
      if (parsed.length > 0) {
        BOOK_DATABASE = parsed;
        populateDropdownFilters();
        updateSheetStatusBadge("cached", BOOK_DATABASE.length);
        console.log(
          `[Kiosk] Cache lokal dimuat seketika: ${BOOK_DATABASE.length} buku.`,
        );
      }
    }
  } catch (err) {
    console.warn("[Kiosk] Tidak dapat membaca cache localStorage:", err);
  }
}

// ==========================================
// 8. PARSER CSV (CRLF COMPLIANT & OFFLINE COVER)
// ==========================================
function parseCSV(csvText) {
  if (!csvText || typeof csvText !== "string") return [];
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, "").replace(/\r$/, ""));

  return lines
    .slice(1)
    .map((rawLine, index) => {
      const line = rawLine.replace(/\r$/, "");
      const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
      const matches = [];
      let match;
      while ((match = regex.exec(line)) !== null) {
        if (match[1] !== undefined) {
          matches.push(
            match[1].replace(/^"|"$/g, "").replace(/""/g, '"').trim(),
          );
        }
      }

      let rowObj = {};
      headers.forEach((header, idx) => {
        rowObj[header] = matches[idx] || "";
      });

      return {
        id: `BK-${index + 1}`,
        sku: rowObj.sku || "-",
        productCode: rowObj.product_code || "-",
        title: rowObj.title || "Tanpa Judul",
        author:
          rowObj.author && rowObj.author.trim()
            ? rowObj.author.trim()
            : "Tidak Diketahui",
        publisher: rowObj.publisher || "-",
        categoryCode: rowObj.category_code || "-",
        category1: rowObj.category_1 || "Umum",
        category2: rowObj.category_2 || "",
        bookNonBook: rowObj["book-nonbook"] || rowObj.book_nonbook || "BOOK",
        price: rowObj.price || "0",
        shelfCode: rowObj.shelf || "RAK -",
        floor: rowObj.floor || "1",
        stock: parseInt(rowObj.stock) || 0,
        synopsis: rowObj.synopsis || "Tidak ada sinopsis tersedia.",
        cover: rowObj.cover_url || DEFAULT_COVER_PLACEHOLDER,
        targetReader: (
          rowObj.target_reader ||
          rowObj["target-reader"] ||
          rowObj.targetReader ||
          ""
        ).trim(),
        targetType: (
          rowObj.target_type ||
          rowObj["target-type"] ||
          rowObj.targetType ||
          ""
        ).trim(),
        bookMood: (
          rowObj.book_mood ||
          rowObj["book-mood"] ||
          rowObj.bookMood ||
          ""
        ).trim(),
      };
    })
    .filter((book) => book.title !== "Tanpa Judul" || book.sku !== "-");
}

// ==========================================
// 9. GOOGLE SHEETS LIVE SYNC
// ==========================================
async function loadDataFromGSheet(silent = false) {
  if (!silent && BOOK_DATABASE.length === 0) {
    updateSheetStatusBadge("loading");
  }

  try {
    const response = await fetch(GSHEET_CSV_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const csvData = await response.text();

    if (
      csvData.trim().startsWith("<!DOCTYPE") ||
      csvData.trim().startsWith("<html")
    ) {
      throw new Error("Respon dari Google Sheets bukan format CSV valid.");
    }

    const parsed = parseCSV(csvData);
    if (parsed.length > 0) {
      BOOK_DATABASE = parsed;
      populateDropdownFilters();

      try {
        localStorage.setItem("kiosk_book_csv", csvData);
        localStorage.setItem("kiosk_book_synced_at", new Date().toISOString());
      } catch (storageErr) {
        console.warn("[Kiosk] LocalStorage penuh:", storageErr);
      }

      updateSheetStatusBadge("live", BOOK_DATABASE.length);
      console.log(
        `[Kiosk] Live Sheet tersinkronisasi: ${BOOK_DATABASE.length} buku.`,
      );

      if (
        searchInput.value.trim().length >= 3 ||
        selectedDropdownFilters.publisher ||
        selectedDropdownFilters.category ||
        selectedDropdownFilters.shelf ||
        isShowingAll
      ) {
        executeSearchNow();
      }
    } else {
      throw new Error("Data CSV kosong.");
    }
  } catch (error) {
    console.error("[Kiosk] Gagal sinkronisasi data live:", error);

    if (BOOK_DATABASE.length === 0) {
      loadCachedDataIfExists();
    }

    if (BOOK_DATABASE.length > 0) {
      updateSheetStatusBadge("cached", BOOK_DATABASE.length);
    } else {
      updateSheetStatusBadge("error");
    }
  }
}

// ==========================================
// 10. KIOSK IDLE AUTO-RESET TIMER
// ==========================================
function setupKioskIdleReset() {
  const registerActivity = () => {
    lastActivityTimestamp = Date.now();
  };

  [
    "touchstart",
    "touchmove",
    "mousedown",
    "mousemove",
    "keydown",
    "click",
    "scroll",
  ].forEach((evt) => {
    window.addEventListener(evt, registerActivity, { passive: true });
  });

  setInterval(() => {
    const elapsedSeconds = (Date.now() - lastActivityTimestamp) / 1000;
    if (elapsedSeconds >= IDLE_RESET_TIMEOUT_SEC) {
      const hasActiveQuery = searchInput.value.trim().length > 0;
      const hasSelection = selectedBookId !== null;
      const hasDropdown = Boolean(
        selectedDropdownFilters.publisher ||
        selectedDropdownFilters.category ||
        selectedDropdownFilters.shelf ||
        isShowingAll,
      );

      if (hasActiveQuery || hasSelection || hasDropdown) {
        console.log("[Kiosk] Reset otomatis karena pengunjung tidak aktif.");
        clearSearch();

        const kbPanel = document.getElementById("virtualKbPanel");
        if (kbPanel && !kbPanel.classList.contains("hidden")) {
          kbPanel.classList.add("hidden");
        }

        setTimeout(() => {
          if (searchInput) searchInput.focus();
        }, 100);
      }
    }
  }, 1000);
}

// ==========================================
// 11. FILTER PILLS KEYWORD & DROPDOWN LOGIC
// ==========================================
function renderFilterPills() {
  filterPillsContainer.innerHTML = FILTER_OPTIONS.map((filter) => {
    const isActive = activeFilters.has(filter.id);
    return `
      <button onclick="toggleFilterPill('${filter.id}')" type="button" 
          class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 border ${
            isActive
              ? "bg-slate-900 text-white border-slate-900 shadow-xs"
              : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
          }">
          <i data-lucide="${filter.icon}" class="w-3.5 h-3.5 ${isActive ? "text-amber-400" : "text-slate-400"}"></i>
          <span>${filter.label}</span>
          ${isActive ? '<i data-lucide="check" class="w-3 h-3 ml-0.5"></i>' : ""}
      </button>
    `;
  }).join("");

  if (window.lucide) {
    lucide.createIcons();
  }
}

function toggleFilterPill(filterId) {
  if (activeFilters.has(filterId)) {
    if (activeFilters.size > 1) {
      activeFilters.delete(filterId);
    }
  } else {
    activeFilters.add(filterId);
  }

  renderFilterPills();

  if (searchInput.value.trim().length >= 3) {
    onInputChanged();
  }
}

function populateDropdownFilters() {
  if (BOOK_DATABASE.length === 0) return;

  dropdownRawData.publisher = [
    ...new Set(
      BOOK_DATABASE.map((b) => b.publisher).filter(
        (p) => p && p !== "-" && p.trim() !== "",
      ),
    ),
  ].sort((a, b) => a.localeCompare("id"));

  dropdownRawData.category = [
    ...new Set(
      BOOK_DATABASE.map((b) => b.category1).filter(
        (c) => c && c !== "-" && c !== "Umum" && c.trim() !== "",
      ),
    ),
  ].sort((a, b) => a.localeCompare("id"));

  dropdownRawData.shelf = [
    ...new Set(
      BOOK_DATABASE.map((b) => b.shelfCode).filter(
        (s) => s && s !== "RAK -" && s.trim() !== "",
      ),
    ),
  ].sort((a, b) => a.localeCompare("id"));

  renderDropdownOptions("publisher");
  renderDropdownOptions("category");
  renderDropdownOptions("shelf");

  if (window.lucide) {
    lucide.createIcons();
  }
}

function renderDropdownOptions(type, filterText = "") {
  const listEl = document.getElementById(`dropdown${capitalize(type)}List`);
  if (!listEl) return;

  const allItems = dropdownRawData[type] || [];
  const query = filterText.trim().toLowerCase();
  const filtered = query
    ? allItems.filter((item) => item.toLowerCase().includes(query))
    : allItems;

  const currentSelected = selectedDropdownFilters[type];
  const typeLabel =
    type === "publisher"
      ? "Semua Penerbit"
      : type === "category"
        ? "Semua Kategori"
        : "Semua Rak";

  let html = `
    <div onclick="selectDropdownOption('${type}', '')" 
         class="px-2.5 py-1.5 hover:bg-slate-100 cursor-pointer rounded-lg flex items-center justify-between transition ${
           !currentSelected
             ? "bg-slate-100 font-bold text-slate-900"
             : "text-slate-600 font-medium"
         }">
      <span>${typeLabel}</span>
      ${!currentSelected ? '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i>' : ""}
    </div>
  `;

  if (filtered.length === 0) {
    html += `
      <div class="py-4 px-2 text-center text-slate-400 text-xs italic">
        Tidak ditemukan "${filterText}"
      </div>
    `;
  } else {
    html += filtered
      .map((item) => {
        const isSelected = item === currentSelected;
        const escaped = item.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        return `
        <div onclick="selectDropdownOption('${type}', '${escaped}')" 
             class="px-2.5 py-1.5 hover:bg-slate-100 cursor-pointer rounded-lg flex items-center justify-between transition ${
               isSelected
                 ? "bg-amber-50 font-bold text-slate-900"
                 : "text-slate-700 font-medium"
             }">
          <span class="truncate">${item}</span>
          ${isSelected ? '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600 shrink-0 ml-1"></i>' : ""}
        </div>
      `;
      })
      .join("");
  }

  listEl.innerHTML = html;
  if (window.lucide) {
    lucide.createIcons();
  }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function toggleCustomDropdown(type, event) {
  if (event) event.stopPropagation();

  if (activeOpenDropdown === type) {
    closeAllCustomDropdowns();
    return;
  }

  closeAllCustomDropdowns();
  activeOpenDropdown = type;

  const panel = document.getElementById(`dropdown${capitalize(type)}Panel`);
  const searchInput = document.getElementById(
    `dropdown${capitalize(type)}Search`,
  );

  if (panel) {
    panel.classList.remove("hidden");
    panel.classList.add("flex");
  }

  if (searchInput) {
    searchInput.value = "";
    renderDropdownOptions(type, "");
    setTimeout(() => searchInput.focus(), 50);
  }
}

function closeAllCustomDropdowns() {
  ["publisher", "category", "shelf"].forEach((type) => {
    const panel = document.getElementById(`dropdown${capitalize(type)}Panel`);
    if (panel) {
      panel.classList.add("hidden");
      panel.classList.remove("flex");
    }
  });
  activeOpenDropdown = null;
}

function filterDropdownOptions(type, query) {
  renderDropdownOptions(type, query);
}

function selectDropdownOption(type, value) {
  selectedDropdownFilters[type] = value;
  isShowingAll = false;
  if (isQuizFilterActive) {
    isQuizFilterActive = false;
    const clearQuizBtn = document.getElementById("clearQuizFilterBtn");
    if (clearQuizBtn) clearQuizBtn.classList.add("hidden");
  }

  const labelEl = document.getElementById(`dropdown${capitalize(type)}Label`);
  const btnEl = document.getElementById(`dropdown${capitalize(type)}Btn`);

  const defaultLabel =
    type === "publisher"
      ? "Semua Penerbit"
      : type === "category"
        ? "Semua Kategori"
        : "Semua Rak";

  if (labelEl) {
    labelEl.textContent = value || defaultLabel;
  }

  const widthClass =
    type === "publisher"
      ? "w-[150px]"
      : type === "category"
        ? "w-[145px]"
        : "w-[125px]";

  if (btnEl) {
    if (value) {
      btnEl.className = `h-8 text-xs font-bold bg-amber-50 border border-amber-300 text-slate-900 rounded-lg px-2.5 flex items-center justify-between gap-1.5 transition shadow-2xs ${widthClass} shrink-0 truncate active:scale-98 cursor-pointer`;
    } else {
      btnEl.className = `h-8 text-xs font-semibold bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-lg px-2.5 flex items-center justify-between gap-1.5 transition shadow-2xs ${widthClass} shrink-0 truncate active:scale-98 cursor-pointer`;
    }
  }

  closeAllCustomDropdowns();
  updateResetDropdownBtnState();
  executeSearchNow();
}

function updateResetDropdownBtnState() {
  const hasActive = Boolean(
    selectedDropdownFilters.publisher ||
    selectedDropdownFilters.category ||
    selectedDropdownFilters.shelf,
  );

  if (resetDropdownsBtn) {
    if (hasActive) {
      resetDropdownsBtn.classList.remove("hidden");
      resetDropdownsBtn.classList.add("flex");
    } else {
      resetDropdownsBtn.classList.add("hidden");
      resetDropdownsBtn.classList.remove("flex");
    }
  }
}

function resetDropdownFilters() {
  selectedDropdownFilters = {
    publisher: "",
    category: "",
    shelf: "",
  };

  ["publisher", "category", "shelf"].forEach((type) => {
    const labelEl = document.getElementById(`dropdown${capitalize(type)}Label`);
    const btnEl = document.getElementById(`dropdown${capitalize(type)}Btn`);
    const defaultLabel =
      type === "publisher"
        ? "Semua Penerbit"
        : type === "category"
          ? "Semua Kategori"
          : "Semua Rak";

    if (labelEl) labelEl.textContent = defaultLabel;

    const widthClass =
      type === "publisher"
        ? "w-[150px]"
        : type === "category"
          ? "w-[145px]"
          : "w-[125px]";

    if (btnEl) {
      btnEl.className = `h-8 text-xs font-semibold bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-lg px-2.5 flex items-center justify-between gap-1.5 transition shadow-2xs ${widthClass} shrink-0 truncate active:scale-98 cursor-pointer`;
    }
    renderDropdownOptions(type, "");
  });

  updateResetDropdownBtnState();
  closeAllCustomDropdowns();
  executeSearchNow();
}

function showAllBooks() {
  isShowingAll = true;
  executeSearchNow();
}

// ==========================================
// 12. PENCARIAN & DEBOUNCE ENGINE
// ==========================================
function onInputChanged() {
  const query = searchInput.value.trim();

  if (isQuizFilterActive) {
    isQuizFilterActive = false;
    const clearQuizBtn = document.getElementById("clearQuizFilterBtn");
    if (clearQuizBtn) clearQuizBtn.classList.add("hidden");
  }

  if (query.length > 0) {
    clearSearchBtn.classList.remove("hidden");
  } else {
    clearSearchBtn.classList.add("hidden");
  }

  clearTimeout(debounceTimer);

  const selPublisher = selectedDropdownFilters.publisher;
  const selCategory = selectedDropdownFilters.category;
  const selShelf = selectedDropdownFilters.shelf;
  const hasDropdown = Boolean(selPublisher || selCategory || selShelf);

  if (query.length < 3 && !hasDropdown && !isShowingAll) {
    loadingState.classList.add("hidden");
    currentResults = [];
    renderTable([]);

    if (query.length > 0) {
      emptyStateTitle.textContent = "Ketik Minimal 3 Karakter";
      emptyStateDesc.innerHTML = `Anda baru mengetik <strong>${query.length} karakter</strong>. Tambahkan minimal <strong>${3 - query.length} karakter lagi</strong> atau gunakan filter dropdown di atas.`;
    } else {
      emptyStateTitle.textContent = "Mulai Pencarian Buku";
      emptyStateDesc.innerHTML = `Pilih <strong>Filter Dropdown</strong> di atas untuk melihat buku berdasarkan Penerbit/Kategori/Rak, atau ketik kata kunci pencarian.`;
    }
    return;
  }

  loadingState.classList.remove("hidden");

  debounceTimer = setTimeout(() => {
    executeSearchNow();
  }, DEBOUNCE_WAIT_MS);
}

// ==========================================
// 12. FUZZY SEARCH (TOLERANSI SALAH KETIK)
// ==========================================
function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function isWordFuzzyMatch(targetWords, queryWord) {
  const qLen = queryWord.length;
  const maxDist = qLen >= 7 ? 2 : qLen >= 4 ? 1 : 0;
  for (const tWord of targetWords) {
    if (tWord.includes(queryWord)) return true;
    if (Math.abs(tWord.length - qLen) <= maxDist) {
      if (levenshteinDistance(tWord, queryWord) <= maxDist) return true;
    }
  }
  return false;
}

function fuzzyMatchText(text, query) {
  if (!text || !query) return false;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerText.includes(lowerQuery)) return true;

  const queryWords = lowerQuery.split(/\s+/).filter((w) => w.length >= 3);
  if (queryWords.length === 0) return false;
  const targetWords = lowerText.split(/[\s,.-]+/).filter(Boolean);

  return queryWords.every((qw) => isWordFuzzyMatch(targetWords, qw));
}

function getFilteredBooks(query) {
  const selPublisher = selectedDropdownFilters.publisher;
  const selCategory = selectedDropdownFilters.category;
  const selShelf = selectedDropdownFilters.shelf;

  const hasDropdown = Boolean(selPublisher || selCategory || selShelf);
  const hasKeyword = Boolean(query && query.length >= 3);
  const cleanQuery = query ? query.trim() : "";

  if (!hasKeyword && !hasDropdown && !isShowingAll) return [];

  return BOOK_DATABASE.filter((book) => {
    // 1. Dropdown Filters
    if (selPublisher && book.publisher !== selPublisher) return false;
    if (selCategory && book.category1 !== selCategory) return false;
    if (selShelf && book.shelfCode !== selShelf) return false;

    // 2. Keyword Filters (Dengan Toleransi Typo / Fuzzy)
    if (hasKeyword) {
      let matches = false;

      if (
        activeFilters.has("title") &&
        book.title &&
        fuzzyMatchText(book.title, cleanQuery)
      ) {
        matches = true;
      }

      if (
        !matches &&
        activeFilters.has("sku") &&
        ((book.sku && fuzzyMatchText(book.sku, cleanQuery)) ||
          (book.productCode && fuzzyMatchText(book.productCode, cleanQuery)))
      ) {
        matches = true;
      }

      if (
        !matches &&
        activeFilters.has("author") &&
        book.author &&
        fuzzyMatchText(book.author, cleanQuery)
      ) {
        matches = true;
      }

      if (
        !matches &&
        activeFilters.has("publisher") &&
        book.publisher &&
        fuzzyMatchText(book.publisher, cleanQuery)
      ) {
        matches = true;
      }

      if (!matches) return false;
    }

    return true;
  });
}

function executeSearchNow() {
  const query = searchInput.value.trim();
  clearTimeout(debounceTimer);

  const selPublisher = selectedDropdownFilters.publisher;
  const selCategory = selectedDropdownFilters.category;
  const selShelf = selectedDropdownFilters.shelf;

  const hasDropdown = Boolean(selPublisher || selCategory || selShelf);
  const hasKeyword = query.length >= 3;

  if (!hasKeyword && !hasDropdown && !isShowingAll) {
    currentResults = [];
    renderTable([]);
    if (query.length > 0) {
      emptyStateTitle.textContent = "Ketik Minimal 3 Karakter";
      emptyStateDesc.innerHTML = `Anda baru mengetik <strong>${query.length} karakter</strong>. Tambahkan minimal <strong>${3 - query.length} karakter lagi</strong> atau gunakan filter dropdown di atas.`;
    } else {
      emptyStateTitle.textContent = "Mulai Pencarian Buku";
      emptyStateDesc.innerHTML = `Pilih <strong>Filter Dropdown</strong> di atas untuk melihat buku berdasarkan Penerbit/Kategori/Rak, atau ketik kata kunci pencarian.`;
    }
    loadingState.classList.add("hidden");
    return;
  }

  currentResults = getFilteredBooks(query);
  if (currentResults.length === 0) {
    emptyStateTitle.textContent = "Buku Tidak Ditemukan";
    emptyStateDesc.innerHTML = `Tidak ada buku yang cocok dengan pencarian <strong>"${query || "filter terpilih"}"</strong>. Silakan coba kata kunci lain atau reset filter.`;
  }
  renderTable(currentResults);
  loadingState.classList.add("hidden");
}

function quickSearch(term) {
  searchInput.value = term;
  clearSearchBtn.classList.remove("hidden");
  onInputChanged();
}

function clearSearch() {
  clearTimeout(debounceTimer);
  searchInput.value = "";
  clearSearchBtn.classList.add("hidden");
  loadingState.classList.add("hidden");
  isShowingAll = false;
  isQuizFilterActive = false;

  const clearQuizBtn = document.getElementById("clearQuizFilterBtn");
  if (clearQuizBtn) clearQuizBtn.classList.add("hidden");

  resetDropdownFilters();

  currentResults = [];
  selectedBookId = null;
  emptyStateTitle.textContent = "Mulai Pencarian Buku";
  emptyStateDesc.innerHTML = `Pilih <strong>Filter Dropdown</strong> di atas untuk melihat buku berdasarkan Penerbit/Kategori/Rak, atau ketik kata kunci pencarian.`;
  if (booksTable) booksTable.classList.add("hidden");
  renderTable([]);
  resetDetailPanel();
  startPromoAutoSlide();

  setTimeout(() => {
    if (searchInput) searchInput.focus();
  }, 50);
}

// ==========================================
// 13. UI TABLE RENDERING (INFINITE SCROLL 30/BATCH)
// ==========================================
const BATCH_SIZE = 30;
let renderedBatchCount = 0;

function renderTable(books) {
  if (!isQuizFilterActive && resultCountBadge) {
    resultCountBadge.textContent = `${books.length} Buku Ditemukan`;
    resultCountBadge.className =
      "text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700";
  }

  if (books.length === 0) {
    if (booksTable) booksTable.classList.add("hidden");
    booksTableBody.innerHTML = "";
    emptyState.classList.remove("hidden");
    resetDetailPanel();
    return;
  }

  if (booksTable) booksTable.classList.remove("hidden");
  emptyState.classList.add("hidden");
  booksTableBody.innerHTML = "";
  renderedBatchCount = 0;

  if (tableContainer) {
    tableContainer.scrollTop = 0;
  }

  renderNextBatch();

  if (books.length > 0) {
    selectBook(books[0].id, false);
  }
}

function renderNextBatch() {
  if (renderedBatchCount >= currentResults.length) return;

  const nextBatch = currentResults.slice(
    renderedBatchCount,
    renderedBatchCount + BATCH_SIZE,
  );

  const rowsHtml = nextBatch
    .map((book, idx) => {
      const rowNumber = renderedBatchCount + idx + 1;
      const isSelected = book.id === selectedBookId;
      const isOutOfStock = book.stock === 0;

      return `
        <tr onclick="selectBook('${book.id}')" 
            data-book-id="${book.id}"
            class="table-row-item ${isSelected ? "is-selected" : ""}">
            <!-- Kolom Nomor Urut Baris (Paling Kiri) -->
            <td class="py-3 px-3 text-center font-mono text-xs font-semibold text-slate-500">
                ${rowNumber}
            </td>
            <td class="py-3 px-4">
                <div class="font-semibold text-slate-900 text-sm leading-snug">${book.title}</div>
                <div class="text-xs text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                    <span class="inline-flex items-center text-[10px] font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        ${book.category1 || "Umum"}
                    </span>
                    ${book.category2 ? `<span class="text-slate-300">•</span><span class="text-[11px] text-slate-500">${book.category2}</span>` : ""}
                    <span class="text-slate-300">•</span>
                    <span class="text-[11px] text-slate-400">${book.publisher}</span>
                </div>
            </td>
            <td class="py-3 px-3 font-mono text-xs text-slate-700 hidden sm:table-cell">
                <span class="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">${book.sku || "-"}</span>
            </td>
            <td class="py-3 px-3">
                <span class="inline-flex items-center gap-1 text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-1 rounded-md">
                    <i data-lucide="map-pin" class="w-3 h-3 text-emerald-600"></i>
                    ${book.shelfCode}
                </span>
            </td>
            <td class="py-3 px-3 text-center">
                ${
                  isOutOfStock
                    ? `<span class="inline-block text-[11px] font-semibold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">Habis</span>`
                    : `<span class="inline-block text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">${book.stock}</span>`
                }
            </td>
            <!-- Kolom Harga Produk -->
            <td class="py-3 px-3 text-right">
                <span class="font-bold text-slate-900 text-xs font-mono whitespace-nowrap">${formatRupiah(book.price)}</span>
            </td>
        </tr>
      `;
    })
    .join("");

  booksTableBody.insertAdjacentHTML("beforeend", rowsHtml);
  renderedBatchCount += nextBatch.length;

  if (window.lucide) {
    lucide.createIcons();
  }
}

// ==========================================
// 14. DETAIL SIDEBAR RENDERING
// ==========================================
function selectBook(bookId, updateTable = true) {
  selectedBookId = bookId;
  const book = BOOK_DATABASE.find((b) => b.id === bookId);
  if (!book) return;

  if (updateTable) {
    const allRows = booksTableBody.querySelectorAll("tr");
    allRows.forEach((row) => {
      if (row.getAttribute("data-book-id") === bookId) {
        row.className = "table-row-item is-selected";
      } else {
        row.className = "table-row-item";
      }
    });
  }

  noSelectionState.classList.add("hidden");
  bookDetailContent.classList.remove("hidden");

  detailShelfCode.textContent = book.shelfCode;
  detailFloor.textContent = formatFloor(book.floor);

  detailCover.src = book.cover || DEFAULT_COVER_PLACEHOLDER;
  detailTitle.textContent = book.title;
  if (detailIsbnUnderTitle) {
    detailIsbnUnderTitle.textContent = book.sku || book.productCode || "-";
  }

  // Harga Produk
  const formattedPrice = formatRupiah(book.price);
  if (detailPriceBadge) detailPriceBadge.textContent = formattedPrice;

  // Status Stok Toko - Format "Stok: X pcs"
  if (book.stock > 0) {
    detailStockBadge.className =
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs";
    detailStockBadge.innerHTML = `
      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
      <span>Stok: ${book.stock} pcs</span>
    `;
  } else {
    detailStockBadge.className =
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs";
    detailStockBadge.innerHTML = `
      <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
      <span>Stok: Habis</span>
    `;
  }

  // Spesifikasi Teknis Lengkap
  if (detailBookNonBook)
    detailBookNonBook.textContent = book.bookNonBook || "BOOK";
  if (detailCategoryCode)
    detailCategoryCode.textContent = book.categoryCode || "-";
  if (detailCategory1) detailCategory1.textContent = book.category1 || "-";
  if (detailCategory2) detailCategory2.textContent = book.category2 || "-";
  if (detailAuthorSpec)
    detailAuthorSpec.textContent = book.author || "Tidak Diketahui";

  detailPublisher.textContent = book.publisher || "-";
  detailProductCode.textContent = book.sku || book.productCode || "-";
  detailSynopsis.textContent = book.synopsis || "Tidak ada sinopsis tersedia.";
}

function resetDetailPanel() {
  noSelectionState.classList.remove("hidden");
  bookDetailContent.classList.add("hidden");
}

// ==========================================
// 15. VIRTUAL TOUCHSCREEN KEYBOARD
// ==========================================
function setupVirtualKeyboard() {
  const row1 = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"];
  const row2 = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];
  const row3 = ["Z", "X", "C", "V", "B", "N", "M"];

  const makeBtn = (char) =>
    `<button onclick="kbInput('${char}')" class="h-9 w-8 sm:w-10 bg-white hover:bg-slate-100 border border-slate-200 rounded text-slate-800 text-xs font-semibold active:bg-slate-200 shadow-xs">${char}</button>`;

  const r1 = document.getElementById("kbRow1");
  const r2 = document.getElementById("kbRow2");
  const r3 = document.getElementById("kbRow3");

  if (r1) r1.innerHTML = row1.map(makeBtn).join("");
  if (r2) r2.innerHTML = row2.map(makeBtn).join("");
  if (r3) r3.innerHTML = row3.map(makeBtn).join("");
}

function toggleVirtualKeyboard() {
  const kbPanel = document.getElementById("virtualKbPanel");
  if (kbPanel) {
    kbPanel.classList.toggle("hidden");
  }
}

function kbInput(char) {
  searchInput.value += char;
  onInputChanged();
}

function kbBackspace() {
  searchInput.value = searchInput.value.slice(0, -1);
  onInputChanged();
}

// ==========================================
// 16. PROMO BANNER CAROUSEL / SLIDER (EMPTY STATE)
// ==========================================
function initPromoBannerCarousel() {
  const track = document.getElementById("promoSliderTrack");
  const dotsContainer = document.getElementById("promoDotsContainer");
  const carouselContainer = document.getElementById("promoCarouselContainer");

  if (!track || !dotsContainer || !PROMO_BANNERS || PROMO_BANNERS.length === 0)
    return;

  // Render Slides
  track.innerHTML = PROMO_BANNERS.map(
    (banner, index) => `
    <div class="promo-slide ${index === 0 ? "is-active" : ""}" data-index="${index}">
      <img
        src="${banner.image}"
        alt="${banner.title || "Banner Promo " + (index + 1)}"
        class="w-full h-full object-cover select-none"
        loading="${index === 0 ? "eager" : "lazy"}"
        onerror="this.src='${DEFAULT_COVER_PLACEHOLDER}'"
      />
      ${
        banner.title
          ? `
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent flex items-end p-4 sm:p-5 pointer-events-none">
        <div class="text-left">
          <span class="inline-block px-2.5 py-0.5 mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-300 bg-black/40 rounded-full border border-amber-300/30 backdrop-blur-xs">
            Promo Spesial
          </span>
          <h4 class="text-white font-extrabold text-sm sm:text-base drop-shadow-md tracking-tight leading-snug">
            ${banner.title}
          </h4>
        </div>
      </div>`
          : ""
      }
    </div>
  `,
  ).join("");

  // Render Dot Indicators
  dotsContainer.innerHTML = PROMO_BANNERS.map(
    (_, index) => `
    <button
      type="button"
      onclick="goToPromoSlide(${index})"
      aria-label="Lihat Promo ${index + 1}"
      class="promo-dot h-2 rounded-full cursor-pointer ${index === 0 ? "is-active" : ""}"
    ></button>
  `,
  ).join("");

  // Jalankan Auto-Slide setiap 5 detik
  startPromoAutoSlide();

  // Pause saat kursor hover / Resume saat kursor keluar
  if (carouselContainer) {
    carouselContainer.addEventListener("mouseenter", pausePromoAutoSlide);
    carouselContainer.addEventListener("mouseleave", startPromoAutoSlide);

    // Dukungan Touch Swipe untuk Layar Sentuh Kiosk
    let touchStartX = 0;
    let touchEndX = 0;
    carouselContainer.addEventListener(
      "touchstart",
      (e) => {
        if (e.changedTouches && e.changedTouches[0]) {
          touchStartX = e.changedTouches[0].screenX;
        }
        pausePromoAutoSlide();
      },
      { passive: true },
    );
    carouselContainer.addEventListener(
      "touchend",
      (e) => {
        if (e.changedTouches && e.changedTouches[0]) {
          touchEndX = e.changedTouches[0].screenX;
          const diff = touchStartX - touchEndX;
          if (diff > 45) {
            nextPromoSlide();
          } else if (diff < -45) {
            prevPromoSlide();
          }
        }
        startPromoAutoSlide();
      },
      { passive: true },
    );
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

function goToPromoSlide(index) {
  if (!PROMO_BANNERS || PROMO_BANNERS.length === 0) return;
  currentPromoSlide = (index + PROMO_BANNERS.length) % PROMO_BANNERS.length;

  const slides = document.querySelectorAll(".promo-slide");
  slides.forEach((slide, idx) => {
    if (idx === currentPromoSlide) {
      slide.classList.add("is-active");
    } else {
      slide.classList.remove("is-active");
    }
  });

  const dots = document.querySelectorAll(".promo-dot");
  dots.forEach((dot, idx) => {
    if (idx === currentPromoSlide) {
      dot.classList.add("is-active");
    } else {
      dot.classList.remove("is-active");
    }
  });
}

function nextPromoSlide() {
  goToPromoSlide(currentPromoSlide + 1);
}

function prevPromoSlide() {
  goToPromoSlide(currentPromoSlide - 1);
}

function startPromoAutoSlide() {
  pausePromoAutoSlide();
  promoAutoSlideTimer = setInterval(() => {
    nextPromoSlide();
  }, PROMO_AUTOSLIDE_INTERVAL_MS);
}

function pausePromoAutoSlide() {
  if (promoAutoSlideTimer) {
    clearInterval(promoAutoSlideTimer);
    promoAutoSlideTimer = null;
  }
}

// ==========================================
// 17. KUIS REKOMENDASI BUKU 15 DETIK (WIZARD MODAL)
// ==========================================
let currentQuizStep = 1;
let quizAnswers = {
  step1: null, // 'anak_remaja' | 'dewasa' | 'semua'
  step2: null, // 'Fiksi' | 'Non-Fiksi' | 'Pelajaran' | 'Agama'
  step3: null, // 'Santai' | 'Misteri' | 'Inspiratif' | 'Petualangan'
};

function openRecommendationQuiz() {
  const modal = document.getElementById("quizModal");
  if (!modal) return;

  // Reset quiz state ke langkah 1
  currentQuizStep = 1;
  quizAnswers = { step1: null, step2: null, step3: null };
  updateQuizModalUI();

  modal.classList.add("is-open");
  if (window.lucide) {
    lucide.createIcons();
  }
}

function closeRecommendationQuiz() {
  const modal = document.getElementById("quizModal");
  if (!modal) return;
  modal.classList.remove("is-open");
}

function handleQuizBackdropClick(event) {
  if (event.target && event.target.id === "quizModal") {
    closeRecommendationQuiz();
  }
}

function updateQuizModalUI() {
  const badge = document.getElementById("quizStepBadge");
  const percent = document.getElementById("quizStepPercent");
  const fill = document.getElementById("quizProgressFill");
  const prevBtn = document.getElementById("quizPrevBtn");

  const stepPercentMap = { 1: "33%", 2: "66%", 3: "100%" };
  const stepWidthMap = { 1: "33.33%", 2: "66.66%", 3: "100%" };

  if (badge) badge.textContent = `Langkah ${currentQuizStep} dari 3`;
  if (percent) percent.textContent = stepPercentMap[currentQuizStep] || "33%";
  if (fill) fill.style.width = stepWidthMap[currentQuizStep] || "33.33%";

  if (prevBtn) {
    if (currentQuizStep > 1) {
      prevBtn.classList.remove("invisible");
    } else {
      prevBtn.classList.add("invisible");
    }
  }

  for (let s = 1; s <= 3; s++) {
    const pane = document.getElementById(`quizStep${s}`);
    if (pane) {
      if (s === currentQuizStep) {
        pane.classList.remove("hidden");
      } else {
        pane.classList.add("hidden");
      }
    }
  }

  const currentVal =
    currentQuizStep === 1
      ? quizAnswers.step1
      : currentQuizStep === 2
        ? quizAnswers.step2
        : quizAnswers.step3;

  const currentPane = document.getElementById(`quizStep${currentQuizStep}`);
  if (currentPane) {
    const cards = currentPane.querySelectorAll(".quiz-option-card");
    cards.forEach((card) => {
      const val = card.getAttribute("data-value");
      if (val && val === currentVal) {
        card.classList.add("is-selected");
      } else {
        card.classList.remove("is-selected");
      }
    });
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

function prevQuizStep() {
  if (currentQuizStep > 1) {
    currentQuizStep--;
    updateQuizModalUI();
  }
}

function selectQuizOption(step, value) {
  if (step === 1) {
    quizAnswers.step1 = value;
    currentQuizStep = 2;
    updateQuizModalUI();
  } else if (step === 2) {
    quizAnswers.step2 = value;
    currentQuizStep = 3;
    updateQuizModalUI();
  } else if (step === 3) {
    quizAnswers.step3 = value;
    closeRecommendationQuiz();
    applyQuizRecommendation();
  }
}

function applyQuizRecommendation() {
  if (!BOOK_DATABASE || BOOK_DATABASE.length === 0) return;

  isQuizFilterActive = true;
  isShowingAll = false;
  if (searchInput) searchInput.value = "";
  if (clearSearchBtn) clearSearchBtn.classList.add("hidden");
  resetDropdownFilters();

  const readerChoice = quizAnswers.step1;
  const targetType = quizAnswers.step2;
  const bookMood = quizAnswers.step3;

  // 1. Helper mencocokkan Target Pembaca (target_reader)
  const matchesReader = (book) => {
    const r = (book.targetReader || "").toLowerCase();
    if (readerChoice === "anak_remaja") {
      return r === "anak" || r === "remaja" || r === "semua";
    } else if (readerChoice === "dewasa") {
      return r === "dewasa" || r === "semua";
    } else {
      return true;
    }
  };

  // 2. Helper mencocokkan Jenis Buku (target_type)
  const matchesType = (book) => {
    const t = (book.targetType || "").toLowerCase();
    return t === (targetType || "").toLowerCase();
  };

  // 3. Helper mencocokkan Mood Buku (book_mood)
  const matchesMood = (book) => {
    const m = (book.bookMood || "").toLowerCase();
    return m === (bookMood || "").toLowerCase();
  };

  // A. Pencocokan 100% (Exact Match: Pembaca + Jenis + Mood)
  let matchedBooks = BOOK_DATABASE.filter(
    (b) => matchesReader(b) && matchesType(b) && matchesMood(b),
  );

  let isFallback = false;

  // B. Fallback jika 100% match kosong:
  // "Jika tidak ada buku yang cocok 100%, tampilkan rekomendasi terdekat berdasarkan target_type."
  if (matchedBooks.length === 0) {
    isFallback = true;
    // Coba target_type + matchesReader terlebih dahulu
    matchedBooks = BOOK_DATABASE.filter(
      (b) => matchesType(b) && matchesReader(b),
    );

    // Jika masih kosong, ambil berdasarkan target_type saja
    if (matchedBooks.length === 0) {
      matchedBooks = BOOK_DATABASE.filter((b) => matchesType(b));
    }
  }

  currentResults = matchedBooks;
  renderTable(currentResults);

  // Tampilkan Tombol Reset/Ulangi Kuis
  const clearQuizBtn = document.getElementById("clearQuizFilterBtn");
  if (clearQuizBtn) clearQuizBtn.classList.remove("hidden");

  // Tampilkan Pesan Badge Spesifik
  if (resultCountBadge) {
    if (!isFallback) {
      resultCountBadge.textContent = `Rekomendasi Spesifik Berdasarkan Kuis Anda (${matchedBooks.length} Buku Ditemukan)`;
    } else {
      resultCountBadge.textContent = `Rekomendasi Terdekat (${targetType}): ${matchedBooks.length} Buku Ditemukan`;
    }
    resultCountBadge.className =
      "text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 select-none";
  }
}

function resetQuizFilter() {
  isQuizFilterActive = false;
  quizAnswers = { step1: null, step2: null, step3: null };

  const clearQuizBtn = document.getElementById("clearQuizFilterBtn");
  if (clearQuizBtn) clearQuizBtn.classList.add("hidden");

  if (resultCountBadge) {
    resultCountBadge.className =
      "text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700";
  }

  clearSearch();
}
