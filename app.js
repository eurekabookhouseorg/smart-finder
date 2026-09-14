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
  initFloorPlan();
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

  // 5. Pasang listener input keyboard & touch
  searchInput.addEventListener("input", onInputChanged);
  searchInput.addEventListener("click", openVirtualKeyboard);

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
        productCode:
          (rowObj.product_code || rowObj.productCode || "").trim() || "-",
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
        closeVirtualKeyboard();

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
      const displayProductCode =
        book.productCode && book.productCode !== "-"
          ? book.productCode
          : book.sku || "-";

      return `
        <tr onclick="selectBook('${book.id}')" 
            data-book-id="${book.id}"
            class="table-row-item ${isSelected ? "is-selected" : ""}">
            <!-- 1. Nomor Urut Baris -->
            <td class="py-3.5 px-3 text-center font-mono text-xs font-semibold text-slate-500 w-12">
                ${rowNumber}
            </td>
            <!-- 2. Judul & Kategori Buku -->
            <td class="py-3.5 px-4">
                <div class="font-bold text-slate-900 text-sm sm:text-base leading-snug">${book.title}</div>
                <div class="text-xs text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                    <span class="inline-flex items-center text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        ${book.category1 || "Umum"}
                    </span>
                    ${book.category2 ? `<span class="text-slate-300">•</span><span class="text-[11px] text-slate-500">${book.category2}</span>` : ""}
                    <span class="text-slate-300">•</span>
                    <span class="text-[11px] text-slate-400">${book.publisher}</span>
                </div>
            </td>
            <!-- 3. Kode Produk -->
            <td class="py-3.5 px-3 font-mono text-xs text-slate-700 hidden sm:table-cell w-36 whitespace-nowrap">
                <span class="bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200">${displayProductCode}</span>
            </td>
            <!-- 4. Kode Rak Lokasi -->
            <td class="py-3.5 px-3 w-32 whitespace-nowrap">
                <span class="inline-flex items-center gap-1 text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-200 px-2.5 py-1 rounded-md">
                    <i data-lucide="map-pin" class="w-3.5 h-3.5 text-emerald-600 shrink-0"></i>
                    ${book.shelfCode}
                </span>
            </td>
            <!-- 5. Stok -->
            <td class="py-3.5 px-3 text-center w-20 whitespace-nowrap">
                ${
                  isOutOfStock
                    ? `<span class="inline-block text-[11px] font-semibold bg-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full">Habis</span>`
                    : `<span class="inline-block text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full">${book.stock}</span>`
                }
            </td>
            <!-- 6. Harga Produk -->
            <td class="py-3.5 px-4 text-right w-32 whitespace-nowrap">
                <span class="font-bold text-slate-900 text-xs sm:text-sm font-mono">${formatRupiah(book.price)}</span>
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
  detailProductCode.textContent = book.productCode || "-";
  detailSynopsis.textContent = book.synopsis || "Tidak ada sinopsis tersedia.";
}

function resetDetailPanel() {
  noSelectionState.classList.remove("hidden");
  bookDetailContent.classList.add("hidden");
}

// ==========================================
// 15. VIRTUAL TOUCHSCREEN KEYBOARD (ANDROID GBOARD STYLE - 20 COLS GRID)
// ==========================================
let currentKbMode = "abc"; // "abc" (huruf) atau "123" (angka & simbol)
let isKbShiftActive = false; // status tombol shift

function setupVirtualKeyboard() {
  const r1 = document.getElementById("kbRow1");
  const r2 = document.getElementById("kbRow2");
  const r3 = document.getElementById("kbRow3");
  const r4 = document.getElementById("kbRow4");
  const hint = document.getElementById("kbModeHint");

  if (!r1 || !r2 || !r3 || !r4) return;

  if (currentKbMode === "abc") {
    if (hint) hint.textContent = "Mode: Huruf (ABC)";

    // Baris 1: 10 Tombol QWERTY dengan hint angka 1-0 (Tiap tombol span 2 dari 20 kolom)
    const row1 = [
      { key: "Q", hint: "1" },
      { key: "W", hint: "2" },
      { key: "E", hint: "3" },
      { key: "R", hint: "4" },
      { key: "T", hint: "5" },
      { key: "Y", hint: "6" },
      { key: "U", hint: "7" },
      { key: "I", hint: "8" },
      { key: "O", hint: "9" },
      { key: "P", hint: "0" },
    ];

    // Baris 2: 9 Tombol ASDFGHJKL (Diapit Spacer 1 kolom di kiri & kanan = 20 kolom)
    const row2 = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];

    // Baris 3: Shift (Span 3) + 7 Tombol ZXCVBNM (Span 2) + Backspace (Span 3) = 20 kolom
    const row3 = ["Z", "X", "C", "V", "B", "N", "M"];

    // Baris 1 Render:
    r1.innerHTML = row1
      .map((item) => {
        const char = isKbShiftActive
          ? item.key.toUpperCase()
          : item.key.toLowerCase();
        return `<button type="button" onclick="kbInput('${char}')" class="kb-key-btn kb-col-2">
          <span>${item.key}</span>
          <span class="kb-hint">${item.hint}</span>
        </button>`;
      })
      .join("");

    // Baris 2 Render: Indent 0.5 key di kiri & kanan persis Android
    r2.innerHTML =
      `<div class="kb-col-1 pointer-events-none select-none"></div>` +
      row2
        .map((char) => {
          const charToType = isKbShiftActive
            ? char.toUpperCase()
            : char.toLowerCase();
          return `<button type="button" onclick="kbInput('${charToType}')" class="kb-key-btn kb-col-2">
            <span>${char}</span>
          </button>`;
        })
        .join("") +
      `<div class="kb-col-1 pointer-events-none select-none"></div>`;

    // Baris 3 Render: Shift di kiri, 7 huruf, Backspace di kanan
    const shiftClass = isKbShiftActive
      ? "kb-key-btn action-btn btn-shift kb-col-3 is-active flex items-center justify-center"
      : "kb-key-btn action-btn btn-shift kb-col-3 flex items-center justify-center";

    r3.innerHTML =
      `<button type="button" onclick="toggleKbShift()" class="${shiftClass}" title="Shift">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4L4 14h5v6h6v-6h5L12 4z"/></svg>
      </button>` +
      row3
        .map((char) => {
          const charToType = isKbShiftActive
            ? char.toUpperCase()
            : char.toLowerCase();
          return `<button type="button" onclick="kbInput('${charToType}')" class="kb-key-btn kb-col-2">
            <span>${char}</span>
          </button>`;
        })
        .join("") +
      `<button type="button" onclick="kbBackspace()" class="kb-key-btn action-btn btn-backspace kb-col-3 flex items-center justify-center" title="Hapus Karakter">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
      </button>`;

    // Baris 4 Render: [?123] (Span 3) + [,] (Span 2) + SPASI (Span 11) + [CARI] (Span 4) = 20 kolom
    r4.innerHTML =
      `<button type="button" onclick="toggleKbMode()" class="kb-key-btn action-btn kb-col-3" title="Angka & Simbol">
        <span>?123</span>
      </button>` +
      `<button type="button" onclick="kbInput(',')" class="kb-key-btn action-btn kb-col-2" title="Koma">
        <span>,</span>
      </button>` +
      `<button type="button" onclick="kbInput(' ')" class="kb-key-btn btn-space kb-col-11" title="Spasi">
        <span>SPASI</span>
      </button>` +
      `<button type="button" onclick="kbSubmit()" class="kb-key-btn btn-submit kb-col-4 flex items-center justify-center gap-1.5" title="Cari Buku">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span>CARI</span>
      </button>`;
  } else {
    // Mode Angka & Simbol (?123)
    if (hint) hint.textContent = "Mode: Angka & Simbol (?123)";

    const numbersRow = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
    const symbolsRow2 = ["@", "#", "$", "%", "&", "-", "+", "(", ")"];
    const symbolsRow3 = ["*", '"', "'", ":", ";", "!", "?"];

    // Baris 1: Angka 1-0 (10 tombol, span 2 = 20 kolom)
    r1.innerHTML = numbersRow
      .map(
        (num) =>
          `<button type="button" onclick="kbInput('${num}')" class="kb-key-btn kb-col-2"><span>${num}</span></button>`,
      )
      .join("");

    // Baris 2: Spacer 1 + 9 Simbol (Span 2) + Spacer 1 = 20 kolom
    r2.innerHTML =
      `<div class="kb-col-1 pointer-events-none select-none"></div>` +
      symbolsRow2
        .map((sym) => {
          const encoded = encodeURIComponent(sym);
          return `<button type="button" onclick="kbInput(decodeURIComponent('${encoded}'))" class="kb-key-btn kb-col-2"><span>${sym}</span></button>`;
        })
        .join("") +
      `<div class="kb-col-1 pointer-events-none select-none"></div>`;

    // Baris 3: Tombol Garis Miring (Span 3) + 7 Simbol (Span 2) + Backspace (Span 3) = 20 kolom
    r3.innerHTML =
      `<button type="button" onclick="kbInput('/')" class="kb-key-btn action-btn kb-col-3" title="Garis Miring">
        <span>/</span>
      </button>` +
      symbolsRow3
        .map((sym) => {
          const encoded = encodeURIComponent(sym);
          return `<button type="button" onclick="kbInput(decodeURIComponent('${encoded}'))" class="kb-key-btn kb-col-2"><span>${sym}</span></button>`;
        })
        .join("") +
      `<button type="button" onclick="kbBackspace()" class="kb-key-btn action-btn btn-backspace kb-col-3 flex items-center justify-center" title="Hapus Karakter">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
      </button>`;

    // Baris 4: [ABC] (Span 3) + [.] (Span 2) + SPASI (Span 11) + [CARI] (Span 4) = 20 kolom
    r4.innerHTML =
      `<button type="button" onclick="toggleKbMode()" class="kb-key-btn action-btn kb-col-3" title="Kembali ke Huruf">
        <span>ABC</span>
      </button>` +
      `<button type="button" onclick="kbInput('.')" class="kb-key-btn action-btn kb-col-2" title="Titik">
        <span>.</span>
      </button>` +
      `<button type="button" onclick="kbInput(' ')" class="kb-key-btn btn-space kb-col-11" title="Spasi">
        <span>SPASI</span>
      </button>` +
      `<button type="button" onclick="kbSubmit()" class="kb-key-btn btn-submit kb-col-4 flex items-center justify-center gap-1.5" title="Cari Buku">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span>CARI</span>
      </button>`;
  }
}

function toggleKbShift() {
  isKbShiftActive = !isKbShiftActive;
  setupVirtualKeyboard();
}

function toggleKbMode() {
  currentKbMode = currentKbMode === "abc" ? "123" : "abc";
  setupVirtualKeyboard();
}

function openVirtualKeyboard() {
  const kbDock = document.getElementById("virtualKbDock");
  if (kbDock) {
    kbDock.classList.add("is-open");
    document.body.classList.add("keyboard-open");
  }
}

function closeVirtualKeyboard() {
  const kbDock = document.getElementById("virtualKbDock");
  if (kbDock) {
    kbDock.classList.remove("is-open");
    document.body.classList.remove("keyboard-open");
  }
  // Reset ke mode huruf saat keyboard ditutup
  if (currentKbMode !== "abc") {
    currentKbMode = "abc";
    setupVirtualKeyboard();
  }
}

function toggleVirtualKeyboard() {
  const kbDock = document.getElementById("virtualKbDock");
  if (kbDock) {
    if (kbDock.classList.contains("is-open")) {
      closeVirtualKeyboard();
    } else {
      openVirtualKeyboard();
    }
  }
}

function kbInput(char) {
  if (!searchInput) return;
  searchInput.value += char;
  onInputChanged();
  if (isKbShiftActive && /[a-zA-Z]/.test(char)) {
    isKbShiftActive = false;
    setupVirtualKeyboard();
  }
}

function kbBackspace() {
  if (!searchInput) return;
  searchInput.value = searchInput.value.slice(0, -1);
  onInputChanged();
}

function kbClear() {
  if (!searchInput) return;
  searchInput.value = "";
  onInputChanged();
  searchInput.focus();
}

function kbSubmit() {
  closeVirtualKeyboard();
  executeSearchNow();
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

// ==========================================
// 19. DENAH INTERAKTIF TOKO & HIGHLIGHT PIN LOKASI RAK
// ==========================================
let mapScale = 1;
let mapPointX = 0;
let mapPointY = 0;
let mapStartX = 0;
let mapStartY = 0;
let isMapDragging = false;
let activeMapBook = null;
let mapTouchDistStart = 0;
let mapInitialScale = 1;

// Pemetaan Kode Rak / Kategori ke ID Elemen SVG
const SHELF_TO_MAP_ID = {
  // Novel & Sastra
  "BR1-040": "novel_1",
  "BR1-041": "novel_1",
  "BR1-042": "novel_2",
  "BR1-043": "novel_2",
  "BR1-044": "novel_3",
  "BR1-045": "novel_3",
  "BR1-046": "novel_4",
  "BR1-047": "novel_4",
  "BR1-048": "best_novel",
  "BR1-049": "best_novel",
  "BR1-050": "best_novel",

  // Rohani & Agama
  "BR1-013": "rohani",
  "BR1-014": "rohani",
  "BR1-015": "rohani",
  "BR1-016": "bismah",
  "BR1-017": "bismah",
  "BR1-018": "bismah",
  "BR1-019": "rohani",
  AGAMA: "rohani",

  // Buku Anak & Cerita
  "BR1-001": "anak_1",
  "BR1-002": "anak_1",
  "BR1-003": "anak_2",
  "BR1-004": "anak_2",
  "BR1-005": "anak_3",
  "BR1-006": "anak_3",
  "BR1-007": "cerita_1",
  "BR1-008": "cerita_anak",
  "BR1-009": "cerita_anak",
  "BR1-010": "anak_wall_1",
  "BR1-011": "anak_wall_2",
  "BR1-012": "anak_wall_3",
  "BR1-020": "anak_wall_4",
  "BR1-030": "anak_wall_5",
  "BR1-031": "anak_promosi",
  "BR1-032": "anak_promosi",
  "BR1-033": "meja_anak_grid",
  "BR1-055": "cerita_anak",

  // Best Seller & New Arrival
  "BR1-051": "best_seller_1",
  "BR1-052": "best_seller_2",
  "BR1-053": "new_arifal_1",
  "BR1-054": "new_arifal_2",

  // Hobi, Musik, Masakan, Desain
  "BW1-001": "desain_majalah",
  "BW1-002": "desain_majalah",
  "BW1-003": "rak_kaca",
  "BW1-004": "rak_kaca",
  "BW1-005": "hobby_musik",
  "BW1-006": "hobby_musik",
  "BW1-007": "peta",
  "BW1-008": "atlas",
  "BW1-009": "buku_import",
  "BW1-010": "buku_tulis_top",

  // ATK & Stationeries
  "AR1-001": "atk_1",
  "AR1-002": "atk_1",
  "AR1-003": "atk_2",
  "AR1-004": "atk_2",
  "AR1-005": "penggaris",
  "AR1-006": "crayola",
  "AR1-007": "staedtler_1",
  "AR1-008": "staedtler_2",
  "AR1-009": "amos_1",
  "AR1-010": "amos_2",
  "AR1-011": "parker",
  "AR1-012": "meja_amos",
  "AR1-013": "rak_amplop",
  "AR1-014": "cart",
  "AR1-015": "cyclone",

  // Komputer & Tas
  "AK1-001": "flash_disk",
  "AK1-002": "mouse_1",
  "AK1-003": "mouse_2",
  "AK1-004": "tas_mid",
  "AK1-005": "bag_1",
  "AK1-006": "bag_2",
};

function updateMapTransform() {
  const viewportGroup = document.getElementById("viewportGroup");
  if (viewportGroup) {
    viewportGroup.removeAttribute("transform");
  }
}

function zoomMap() {
  // Statis: Zoom dinonaktifkan sesuai kebutuhan tampilan 1 layar
}

function resetMapZoom() {
  // Statis: Denah selalu tampil utuh dalam 1 layar
  updateMapTransform();
}

function centerMapOn(cx, cy) {
  // Statis: Denah selalu tampil utuh dalam 1 layar
  updateMapTransform();
}

function getElementCenter(element) {
  if (!element) return { cx: 425, cy: 550 };

  const rect = element.querySelector("rect");
  if (rect) {
    const x = parseFloat(rect.getAttribute("x")) || 0;
    const y = parseFloat(rect.getAttribute("y")) || 0;
    const w = parseFloat(rect.getAttribute("width")) || 0;
    const h = parseFloat(rect.getAttribute("height")) || 0;
    return { cx: x + w / 2, cy: y + h / 2 };
  }

  const poly = element.querySelector("polygon");
  if (poly && poly.points && poly.points.length > 0) {
    let sumX = 0,
      sumY = 0;
    for (let i = 0; i < poly.points.length; i++) {
      sumX += poly.points[i].x;
      sumY += poly.points[i].y;
    }
    return { cx: sumX / poly.points.length, cy: sumY / poly.points.length };
  }

  const path = element.querySelector("path");
  if (path && typeof path.getBBox === "function") {
    try {
      const bbox = path.getBBox();
      return { cx: bbox.x + bbox.width / 2, cy: bbox.y + bbox.height / 2 };
    } catch (e) {}
  }

  if (typeof element.getBBox === "function") {
    try {
      const bbox = element.getBBox();
      return { cx: bbox.x + bbox.width / 2, cy: bbox.y + bbox.height / 2 };
    } catch (e) {}
  }

  return { cx: 425, cy: 550 };
}

function findShelfElementForBook(book) {
  if (!book) return null;
  const shelfCode = (book.shelfCode || "").toUpperCase().trim();
  const cat1 = (book.category1 || "").toUpperCase();
  const cat2 = (book.category2 || "").toUpperCase();
  const title = (book.title || "").toUpperCase();

  // 1. Direct ID match
  let target = document.querySelector(
    `.shelf-group[data-id="${shelfCode.toLowerCase()}"]`,
  );
  if (target) return target;

  // 2. Direct map table
  const mappedId = SHELF_TO_MAP_ID[shelfCode];
  if (mappedId) {
    target = document.querySelector(`.shelf-group[data-id="${mappedId}"]`);
    if (target) return target;
  }

  // 3. Prefix & Number Range Mapping
  if (shelfCode.startsWith("BR1-") || shelfCode.startsWith("BR-")) {
    const num = parseInt(shelfCode.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(num)) {
      if (num >= 1 && num <= 10)
        return (
          document.querySelector('.shelf-group[data-id="anak_1"]') ||
          document.querySelector('.shelf-group[data-id="cerita_1"]')
        );
      if (num >= 11 && num <= 20)
        return (
          document.querySelector('.shelf-group[data-id="rohani"]') ||
          document.querySelector('.shelf-group[data-id="bismah"]')
        );
      if (num >= 21 && num <= 35)
        return (
          document.querySelector('.shelf-group[data-id="cerita_anak"]') ||
          document.querySelector('.shelf-group[data-id="anak_wall_1"]')
        );
      if (num >= 36 && num <= 45)
        return (
          document.querySelector('.shelf-group[data-id="novel_1"]') ||
          document.querySelector('.shelf-group[data-id="novel_2"]')
        );
      if (num >= 46 && num <= 55)
        return (
          document.querySelector('.shelf-group[data-id="novel_3"]') ||
          document.querySelector('.shelf-group[data-id="novel_4"]')
        );
      if (num >= 56 && num <= 70)
        return (
          document.querySelector('.shelf-group[data-id="best_novel"]') ||
          document.querySelector('.shelf-group[data-id="best_seller_1"]')
        );
    }
  } else if (shelfCode.startsWith("BW1-") || shelfCode.startsWith("BW-")) {
    const num = parseInt(shelfCode.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(num)) {
      if (num <= 5)
        return (
          document.querySelector('.shelf-group[data-id="hobby_musik"]') ||
          document.querySelector('.shelf-group[data-id="rak_kaca"]')
        );
      if (num <= 10)
        return (
          document.querySelector('.shelf-group[data-id="desain_majalah"]') ||
          document.querySelector('.shelf-group[data-id="peta"]')
        );
      return (
        document.querySelector('.shelf-group[data-id="buku_tulis_top"]') ||
        document.querySelector('.shelf-group[data-id="buku_import"]')
      );
    }
  } else if (shelfCode.startsWith("AR1-") || shelfCode.startsWith("AR-")) {
    const num = parseInt(shelfCode.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(num) && num > 15)
      return document.querySelector('.shelf-group[data-id="atk_2"]');
    return document.querySelector('.shelf-group[data-id="atk_1"]');
  } else if (shelfCode.startsWith("AK1-") || shelfCode.startsWith("AK-")) {
    return (
      document.querySelector('.shelf-group[data-id="rak_kaca"]') ||
      document.querySelector('.shelf-group[data-id="flash_disk"]')
    );
  }

  // 4. Category & Content Heuristics
  const allCat = `${cat1} ${cat2} ${title}`;
  if (
    allCat.includes("ANAK") ||
    allCat.includes("TK") ||
    allCat.includes("PAUD") ||
    allCat.includes("DONGENG")
  ) {
    return (
      document.querySelector('.shelf-group[data-id="cerita_anak"]') ||
      document.querySelector('.shelf-group[data-id="anak_1"]')
    );
  }
  if (
    allCat.includes("NOVEL") ||
    allCat.includes("FIKSI") ||
    allCat.includes("SASTRA") ||
    allCat.includes("ROMAN")
  ) {
    return (
      document.querySelector('.shelf-group[data-id="novel_1"]') ||
      document.querySelector('.shelf-group[data-id="best_novel"]')
    );
  }
  if (
    allCat.includes("AGAMA") ||
    allCat.includes("ISLAM") ||
    allCat.includes("QURAN") ||
    allCat.includes("ROHANI") ||
    allCat.includes("DOA")
  ) {
    return (
      document.querySelector('.shelf-group[data-id="rohani"]') ||
      document.querySelector('.shelf-group[data-id="bismah"]')
    );
  }
  if (
    allCat.includes("HOBI") ||
    allCat.includes("MUSIK") ||
    allCat.includes("SENI") ||
    allCat.includes("GAMBAR")
  ) {
    return (
      document.querySelector('.shelf-group[data-id="hobby_musik"]') ||
      document.querySelector('.shelf-group[data-id="meja_gambar"]')
    );
  }
  if (
    allCat.includes("ATK") ||
    allCat.includes("ALAT TULIS") ||
    allCat.includes("PENSIL") ||
    allCat.includes("PULPEN")
  ) {
    return (
      document.querySelector('.shelf-group[data-id="atk_1"]') ||
      document.querySelector('.shelf-group[data-id="atk_2"]')
    );
  }
  if (
    allCat.includes("PETA") ||
    allCat.includes("ATLAS") ||
    allCat.includes("KAMUS") ||
    allCat.includes("REFERENSI")
  ) {
    return (
      document.querySelector('.shelf-group[data-id="atlas"]') ||
      document.querySelector('.shelf-group[data-id="peta"]')
    );
  }
  if (allCat.includes("KOMIK")) {
    return (
      document.querySelector('.shelf-group[data-id="cerita_anak"]') ||
      document.querySelector('.shelf-group[data-id="anak_3"]')
    );
  }
  if (allCat.includes("IMPOR") || allCat.includes("ENGLISH")) {
    return document.querySelector('.shelf-group[data-id="buku_import"]');
  }
  if (allCat.includes("MAJALAH") || allCat.includes("DESAIN")) {
    return document.querySelector('.shelf-group[data-id="desain_majalah"]');
  }

  return (
    document.querySelector('.shelf-group[data-id="best_seller_1"]') ||
    document.querySelector('.shelf-group[data-id="divider_rack"]')
  );
}

function renderBookPinOnMap(cx, cy, shelfCode, bookTitle) {
  const pinLayer = document.getElementById("mapPinMarkerLayer");
  if (!pinLayer) return;

  pinLayer.innerHTML = `
    <g id="currentBookPin" transform="translate(${cx}, ${cy})">
      <!-- Outer Radar Pulse Rings -->
      <circle r="14" fill="none" stroke="#ef4444" stroke-width="2.5" class="pin-radar-ring" />
      <circle r="26" fill="none" stroke="#ef4444" stroke-width="2" class="pin-radar-ring" style="animation-delay: 0.6s;" />
      <circle r="38" fill="none" stroke="#f59e0b" stroke-width="1.5" class="pin-radar-ring" style="animation-delay: 1.2s;" />

      <!-- Center Drop Shadow Base -->
      <ellipse cx="0" cy="2" rx="7" ry="3.5" fill="rgba(0,0,0,0.25)" />

      <!-- Bouncing Pin Icon -->
      <g class="pin-bounce-icon">
        <path d="M 0 0 C -11 -16 -11 -34 0 -34 C 11 -34 11 -16 0 0 Z" 
              fill="#ef4444" stroke="#ffffff" stroke-width="2" 
              style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.3));" />
        <circle cx="0" cy="-22" r="4.5" fill="#ffffff" />
        <circle cx="0" cy="-22" r="2" fill="#ef4444" />
      </g>

      <!-- Floating Label Badge (Clean Light Mode) -->
      <g transform="translate(0, -42)">
        <rect x="-65" y="-16" width="130" height="22" rx="6" fill="#ffffff" stroke="#ef4444" stroke-width="1.5" style="filter: drop-shadow(0 2px 5px rgba(0,0,0,0.15));" />
        <text x="0" y="-1" font-family="Inter, sans-serif" font-size="10.5" font-weight="700" fill="#0f172a" text-anchor="middle">
          📍 ${shelfCode || "LOKASI RAK"}
        </text>
      </g>
    </g>
  `;
}

function selectShelfOnMap(groupElement) {
  if (!groupElement) return;

  // Clear previous shelf highlights
  document.querySelectorAll(".shelf-item.highlighted").forEach((el) => {
    el.classList.remove("highlighted");
  });

  const rectItem = groupElement.querySelector(".shelf-item");
  if (rectItem) {
    rectItem.classList.add("highlighted");
  }

  const title = groupElement.getAttribute("data-title") || "Area Toko";
  const id = groupElement.getAttribute("data-id") || "-";
  const category = groupElement.getAttribute("data-category") || "Umum";
  const itemsStr = groupElement.getAttribute("data-items") || "";

  const mapShelfTitle = document.getElementById("mapShelfTitle");
  const mapShelfID = document.getElementById("mapShelfID");
  const mapCategoryBadge = document.getElementById("mapCategoryBadge");
  const mapItemList = document.getElementById("mapItemList");
  const mapDefaultState = document.getElementById("mapDefaultState");
  const mapSelectedState = document.getElementById("mapSelectedState");

  if (mapShelfTitle) mapShelfTitle.textContent = title;
  if (mapShelfID) mapShelfID.textContent = `ID Area: ${id}`;
  if (mapCategoryBadge) mapCategoryBadge.textContent = category;

  if (mapItemList) {
    mapItemList.innerHTML = "";
    if (itemsStr) {
      const items = itemsStr.split(",").map((i) => i.trim());
      items.forEach((item) => {
        const tag = document.createElement("span");
        tag.className =
          "px-2.5 py-1 text-xs bg-slate-100 text-slate-700 border border-slate-200 rounded-md font-medium";
        tag.textContent = item;
        mapItemList.appendChild(tag);
      });
    } else {
      mapItemList.innerHTML =
        '<span class="text-xs text-slate-500">Tidak ada detail item khusus.</span>';
    }
  }

  if (mapDefaultState) mapDefaultState.classList.add("hidden");
  if (mapSelectedState) mapSelectedState.classList.remove("hidden");
}

function openFloorPlanModal(targetBook = null) {
  const modal = document.getElementById("floorPlanModal");
  if (!modal) return;

  modal.classList.remove("hidden");
  document.body.classList.add("overflow-hidden");

  // Re-create lucide icons inside modal
  if (window.lucide) {
    lucide.createIcons();
  }

  const banner = document.getElementById("mapBookTargetBanner");
  const bookContextCard = document.getElementById("mapBookContextCard");
  const pinLayer = document.getElementById("mapPinMarkerLayer");

  if (targetBook) {
    activeMapBook = targetBook;

    // Show Book Banner
    if (banner) {
      banner.classList.remove("hidden");
      const titleEl = document.getElementById("mapTargetBookTitle");
      const shelfEl = document.getElementById("mapTargetShelfBadge");
      if (titleEl) titleEl.textContent = targetBook.title;
      if (shelfEl) shelfEl.textContent = targetBook.shelfCode;
    }

    // Show Book Context Card in Sidebar
    if (bookContextCard) {
      bookContextCard.classList.remove("hidden");
      const bTitle = document.getElementById("mapBookContextTitle");
      const bShelf = document.getElementById("mapBookContextShelf");
      const bFloor = document.getElementById("mapBookContextFloor");
      const bStock = document.getElementById("mapBookContextStock");
      if (bTitle) bTitle.textContent = targetBook.title;
      if (bShelf) bShelf.textContent = targetBook.shelfCode;
      if (bFloor) bFloor.textContent = formatFloor(targetBook.floor);
      if (bStock)
        bStock.textContent =
          targetBook.stock > 0
            ? `Stok: ${targetBook.stock} pcs`
            : "Stok: Habis";
    }

    // Highlight target shelf and render static pin directly on 1-screen map
    const targetElement = findShelfElementForBook(targetBook);
    if (targetElement) {
      selectShelfOnMap(targetElement);
      const center = getElementCenter(targetElement);
      renderBookPinOnMap(
        center.cx,
        center.cy,
        targetBook.shelfCode,
        targetBook.title,
      );
    }
  } else {
    // Exploration mode without specific book
    activeMapBook = null;
    if (banner) banner.classList.add("hidden");
    if (bookContextCard) bookContextCard.classList.add("hidden");
    if (pinLayer) pinLayer.innerHTML = "";

    // Clear highlights
    document.querySelectorAll(".shelf-item.highlighted").forEach((el) => {
      el.classList.remove("highlighted");
    });

    const mapDefaultState = document.getElementById("mapDefaultState");
    const mapSelectedState = document.getElementById("mapSelectedState");
    if (mapDefaultState) mapDefaultState.classList.remove("hidden");
    if (mapSelectedState) mapSelectedState.classList.add("hidden");
  }
}

function closeFloorPlanModal() {
  const modal = document.getElementById("floorPlanModal");
  if (!modal) return;

  modal.classList.add("hidden");
  document.body.classList.remove("overflow-hidden");

  activeMapBook = null;
  const pinLayer = document.getElementById("mapPinMarkerLayer");
  if (pinLayer) pinLayer.innerHTML = "";
  document.querySelectorAll(".shelf-item.highlighted").forEach((el) => {
    el.classList.remove("highlighted");
  });
}

function openFloorPlanForCurrentBook() {
  const book = BOOK_DATABASE.find((b) => b.id === selectedBookId);
  if (book) {
    openFloorPlanModal(book);
  } else {
    openFloorPlanModal();
  }
}

function clearMapSearch() {
  const input = document.getElementById("mapSearchInput");
  const clearBtn = document.getElementById("clearMapSearchBtn");
  if (input) input.value = "";
  if (clearBtn) clearBtn.classList.add("hidden");

  document.querySelectorAll(".shelf-item.highlighted").forEach((el) => {
    el.classList.remove("highlighted");
  });

  if (activeMapBook) {
    const targetElement = findShelfElementForBook(activeMapBook);
    if (targetElement) {
      const rectItem = targetElement.querySelector(".shelf-item");
      if (rectItem) rectItem.classList.add("highlighted");
    }
  }
}

function initFloorPlan() {
  const container = document.getElementById("mapViewportContainer");
  const searchInput = document.getElementById("mapSearchInput");
  const clearSearchBtn = document.getElementById("clearMapSearchBtn");
  const totalRacksCount = document.getElementById("mapTotalRacksCount");

  if (!container) return;

  const shelfGroups = document.querySelectorAll(".shelf-group");
  if (totalRacksCount) {
    totalRacksCount.textContent = shelfGroups.length;
  }

  // 1. Shelf Click Handler
  shelfGroups.forEach((group) => {
    group.addEventListener("click", (e) => {
      e.stopPropagation();
      selectShelfOnMap(group);
    });
  });

  // 2. Search Bar Filter & Real-Time Highlight
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      if (clearSearchBtn) {
        if (query.length > 0) {
          clearSearchBtn.classList.remove("hidden");
        } else {
          clearSearchBtn.classList.add("hidden");
        }
      }

      shelfGroups.forEach((group) => {
        const title = (group.getAttribute("data-title") || "").toLowerCase();
        const category = (
          group.getAttribute("data-category") || ""
        ).toLowerCase();
        const items = (group.getAttribute("data-items") || "").toLowerCase();
        const id = (group.getAttribute("data-id") || "").toLowerCase();
        const rectItem = group.querySelector(".shelf-item");

        if (
          query &&
          (title.includes(query) ||
            category.includes(query) ||
            items.includes(query) ||
            id.includes(query))
        ) {
          if (rectItem) rectItem.classList.add("highlighted");
        } else {
          if (rectItem) rectItem.classList.remove("highlighted");
        }
      });
    });
  }

  // 3. Close modal on ESC key
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modal = document.getElementById("floorPlanModal");
      if (modal && !modal.classList.contains("hidden")) {
        closeFloorPlanModal();
      }
    }
  });
}
