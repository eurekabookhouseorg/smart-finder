/**
 * SMART FINDER KIOSK - EUREKA BOOKHOUSE
 * Logika Utama Aplikasi Kiosk Touchscreen (Offline-First)
 * Versi: 2.0.0
 */

// ==========================================
// 1. KONFIGURASI & KONSTANTA
// ==========================================
const GSHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vToC4BgoIFyLTZ9CyT0rwc5RQ8pIgCTBgiAF0EUOk05UTzuVpCTxiKqdqG-rOp6vN6zsA1NhhsP0n5e/pub?gid=0&single=true&output=csv";

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
  { id: "category", label: "Kategori", icon: "tags" },
];

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

// ==========================================
// 3. REFERENSI ELEMEN DOM
// ==========================================
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const booksTableBody = document.getElementById("booksTableBody");
const emptyState = document.getElementById("emptyState");
const emptyStateTitle = document.getElementById("emptyStateTitle");
const emptyStateDesc = document.getElementById("emptyStateDesc");
const loadingState = document.getElementById("loadingState");
const resultCountBadge = document.getElementById("resultCountBadge");
const filterPillsContainer = document.getElementById("filterPillsContainer");
const activeFilterCount = document.getElementById("activeFilterCount");
const sheetStatusBadge = document.getElementById("sheetStatusBadge");

// Filter Dropdown & PWA DOMs
const resetDropdownsBtn = document.getElementById("resetDropdownsBtn");
const pwaInstallBtn = document.getElementById("pwaInstallBtn");

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
const detailAuthor = document.getElementById("detailAuthor");
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

  // 8. Daftarkan Service Worker PWA untuk offline caching
  registerServiceWorker();
});

// ==========================================
// 6. PWA INSTALLATION & SERVICE WORKER
// ==========================================
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  if (pwaInstallBtn) {
    pwaInstallBtn.classList.remove("hidden");
    pwaInstallBtn.classList.add("flex");
  }
});

function triggerPwaInstall() {
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    deferredPwaPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === "accepted") {
        console.log("[PWA] Pengguna menyetujui instalasi aplikasi");
      }
      deferredPwaPrompt = null;
      if (pwaInstallBtn) {
        pwaInstallBtn.classList.add("hidden");
        pwaInstallBtn.classList.remove("flex");
      }
    });
  }
}

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

  activeFilterCount.textContent = `${activeFilters.size} Kategori Aktif`;
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
           !currentSelected ? "bg-slate-100 font-bold text-slate-900" : "text-slate-600 font-medium"
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
               isSelected ? "bg-amber-50 font-bold text-slate-900" : "text-slate-700 font-medium"
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

  if (btnEl) {
    if (value) {
      btnEl.className =
        "h-8 text-xs font-bold bg-amber-50 border border-amber-300 text-slate-900 rounded-lg px-2.5 flex items-center justify-between gap-1.5 transition shadow-2xs max-w-[155px] truncate active:scale-98 cursor-pointer";
    } else {
      btnEl.className =
        "h-8 text-xs font-semibold bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-lg px-2.5 flex items-center justify-between gap-1.5 transition shadow-2xs max-w-[155px] truncate active:scale-98 cursor-pointer";
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
    if (btnEl) {
      btnEl.className =
        "h-8 text-xs font-semibold bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-lg px-2.5 flex items-center justify-between gap-1.5 transition shadow-2xs max-w-[155px] truncate active:scale-98 cursor-pointer";
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

function getFilteredBooks(query) {
  const selPublisher = selectedDropdownFilters.publisher;
  const selCategory = selectedDropdownFilters.category;
  const selShelf = selectedDropdownFilters.shelf;

  const hasDropdown = Boolean(selPublisher || selCategory || selShelf);
  const hasKeyword = Boolean(query && query.length >= 3);
  const lowerQuery = query ? query.toLowerCase() : "";

  if (!hasKeyword && !hasDropdown && !isShowingAll) return [];

  return BOOK_DATABASE.filter((book) => {
    // 1. Dropdown Filters
    if (selPublisher && book.publisher !== selPublisher) return false;
    if (selCategory && book.category1 !== selCategory) return false;
    if (selShelf && book.shelfCode !== selShelf) return false;

    // 2. Keyword Filters
    if (hasKeyword) {
      let matches = false;

      if (
        activeFilters.has("title") &&
        book.title &&
        book.title.toLowerCase().includes(lowerQuery)
      )
        matches = true;

      if (
        activeFilters.has("sku") &&
        ((book.sku && book.sku.toLowerCase().includes(lowerQuery)) ||
          (book.productCode &&
            book.productCode.toLowerCase().includes(lowerQuery)))
      )
        matches = true;

      if (
        activeFilters.has("author") &&
        book.author &&
        book.author.toLowerCase().includes(lowerQuery)
      )
        matches = true;

      if (
        activeFilters.has("publisher") &&
        book.publisher &&
        book.publisher.toLowerCase().includes(lowerQuery)
      )
        matches = true;

      if (
        activeFilters.has("category") &&
        ((book.category1 &&
          book.category1.toLowerCase().includes(lowerQuery)) ||
          (book.category2 &&
            book.category2.toLowerCase().includes(lowerQuery)) ||
          (book.categoryCode &&
            book.categoryCode.toLowerCase().includes(lowerQuery)))
      )
        matches = true;

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

  resetDropdownFilters();

  currentResults = [];
  selectedBookId = null;
  emptyStateTitle.textContent = "Mulai Pencarian Buku";
  emptyStateDesc.innerHTML = `Pilih <strong>Filter Dropdown</strong> di atas untuk melihat buku berdasarkan Penerbit/Kategori/Rak, atau ketik kata kunci pencarian.`;
  renderTable([]);
  resetDetailPanel();
}

// ==========================================
// 13. UI TABLE RENDERING
// ==========================================
function renderTable(books) {
  resultCountBadge.textContent = `${books.length} Buku Ditemukan`;

  if (books.length === 0) {
    booksTableBody.innerHTML = "";
    emptyState.classList.remove("hidden");
    resetDetailPanel();
    return;
  }

  emptyState.classList.add("hidden");

  booksTableBody.innerHTML = books
    .map((book) => {
      const isSelected = book.id === selectedBookId;
      const isOutOfStock = book.stock === 0;

      return `
        <tr onclick="selectBook('${book.id}')" 
            class="cursor-pointer transition hover:bg-slate-50 ${isSelected ? "bg-amber-50/80 border-l-4 border-l-amber-500" : ""}">
            <td class="py-3 px-4">
                <div class="font-semibold text-slate-900 text-sm leading-snug">${book.title}</div>
                <!-- Info Kategori menggantikan Author -->
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
                <span class="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded border border-slate-200">${book.productCode}</span>
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
                    : `<span class="inline-block text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">${book.stock} Ada</span>`
                }
            </td>
            <!-- Kolom Harga Produk -->
            <td class="py-3 px-3 text-right">
                <span class="font-bold text-slate-900 text-xs font-mono whitespace-nowrap">${formatRupiah(book.price)}</span>
            </td>
            <td class="py-3 px-3 text-right">
                <button class="h-8 px-3 text-xs font-medium rounded-md ${isSelected ? "bg-slate-900 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"} transition">
                    ${isSelected ? "Dipilih" : "Lihat Lokasi"}
                </button>
            </td>
        </tr>
      `;
    })
    .join("");

  if (window.lucide) {
    lucide.createIcons();
  }

  if (books.length > 0 && !selectedBookId) {
    selectBook(books[0].id);
  }
}

// ==========================================
// 14. DETAIL SIDEBAR RENDERING
// ==========================================
function selectBook(bookId) {
  selectedBookId = bookId;
  const book = BOOK_DATABASE.find((b) => b.id === bookId);
  if (!book) return;

  renderTable(currentResults);

  noSelectionState.classList.add("hidden");
  bookDetailContent.classList.remove("hidden");

  detailShelfCode.textContent = book.shelfCode;
  detailFloor.textContent = formatFloor(book.floor);

  detailCover.src = book.cover || DEFAULT_COVER_PLACEHOLDER;
  detailTitle.textContent = book.title;
  detailAuthor.textContent = `oleh ${book.author || "Tidak Diketahui"}`;

  // Harga Produk
  const formattedPrice = formatRupiah(book.price);
  if (detailPriceBadge) detailPriceBadge.textContent = formattedPrice;
  if (detailPrice) detailPrice.textContent = formattedPrice;

  // Status Stok Toko - Tampilan Pill Modern & Estetik
  if (book.stock > 0) {
    detailStockBadge.className =
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs";
    detailStockBadge.innerHTML = `
      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
      <span>Tersedia (${book.stock} eksemplar)</span>
    `;
  } else {
    detailStockBadge.className =
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs";
    detailStockBadge.innerHTML = `
      <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
      <span>Stok Habis (Pesan Kasir)</span>
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
  detailSku.textContent = book.sku || "-";
  detailProductCode.textContent = book.productCode || "-";
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
