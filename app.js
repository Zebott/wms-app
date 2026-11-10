/**
 * ==============================================================================
 * ITX WMS MOBILE SCANNER - RAK & BIN MANAGEMENT ENGINE
 * Multi-device Warehouse Management System: Real-time Cloud Sync & Bin Tracking
 * ==============================================================================
 */

(function () {
  'use strict';

  // --- Audio Feedback (Web Audio API Synthesizer - 100% Offline) ---
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playTone(freq, type, duration, delay = 0) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration);
      }, delay);
    } catch (e) {}
  }

  function playBeepSuccess() {
    playTone(880, 'sine', 0.12, 0);     // A5
    playTone(1320, 'sine', 0.18, 120);  // E6
  }

  function playBeepLoc() {
    playTone(660, 'triangle', 0.1, 0);
    playTone(990, 'triangle', 0.12, 100);
  }

  function playBeepError() {
    playTone(330, 'sawtooth', 0.25, 0);
    playTone(220, 'sawtooth', 0.35, 180);
  }

  // --- Constants & Storage Keys ---
  const STORAGE_KEY = 'ITX_WMS_STATE_V1';
  const HISTORY_KEY = 'ITX_WMS_HISTORY_V1';
  const QUEUE_KEY = 'ITX_WMS_QUEUE_V1';

  // --- State ---
  let database = { items: {}, articles: {}, barcodes: {}, lokasi: [], racks: [], defaultBins: [] };

  let state = {
    gudang: '55022',
    petugas: 'YONO',
    deviceId: 'PDT-01',
    binAsal: 'A-001-1-001',
    binTujuan: 'A-001-2-001',
    activeLocTarget: 'asal', // 'asal' or 'tujuan'
    cloudUrl: '',
    activeTab: 'tabTransfer'
  };

  let historyList = [];
  let syncQueue = [];
  let isSyncing = false;
  let html5QrCode = null;

  // --- DOM Elements ---
  const elInputGudang = document.getElementById('inputGudang');
  const elSuggestGudang = document.getElementById('suggestGudang');
  const elBadgeGudang = document.getElementById('badgeGudangVerified');
  const elInputPetugas = document.getElementById('inputPetugas');
  const elInputDevice = document.getElementById('inputDevice');
  const elBtnToggleHeader = document.getElementById('btnToggleHeader');
  const elHeaderCardBody = document.getElementById('headerCardBody');
  const elHeaderToggleIcon = document.getElementById('headerToggleIcon');

  const elCardLocAsal = document.getElementById('cardLocAsal');
  const elCardLocTujuan = document.getElementById('cardLocTujuan');
  const elDispBinAsal = document.getElementById('dispBinAsal');
  const elDispBinTujuan = document.getElementById('dispBinTujuan');
  const elBtnSwapLocations = document.getElementById('btnSwapLocations');
  const elBtnOpenBinPicker = document.getElementById('btnOpenBinPicker');

  const elInputQty = document.getElementById('inputQty');
  const elBtnQtyMinus = document.getElementById('btnQtyMinus');
  const elBtnQtyPlus = document.getElementById('btnQtyPlus');
  const elInputScanCode = document.getElementById('inputScanCode');
  const elSuggestBox = document.getElementById('suggestBox');
  const elBtnSubmitTransfer = document.getElementById('btnSubmitTransfer');
  const elLiveItemCard = document.getElementById('liveItemCard');
  const elLiveItemIcon = document.getElementById('liveItemIcon');
  const elLiveItemName = document.getElementById('liveItemName');
  const elLiveItemMeta = document.getElementById('liveItemMeta');

  const elCloudDot = document.getElementById('cloudDot');
  const elCloudStatusText = document.getElementById('cloudStatusText');
  const elPendingQueueCount = document.getElementById('pendingQueueCount');
  const elBtnSyncNow = document.getElementById('btnSyncNow');

  const elTabCountHistory = document.getElementById('tabCountHistory');
  const elHistoryContainer = document.getElementById('historyListContainer');
  const elBtnClearHistory = document.getElementById('btnClearHistory');

  // Preview Hasil Scan Elements
  const elDispTotalPindahSesi = document.getElementById('dispTotalPindahSesi');
  const elLastTransferHighlight = document.getElementById('lastTransferHighlight');
  const elLastTxTime = document.getElementById('lastTxTime');
  const elLastTxTitle = document.getElementById('lastTxTitle');
  const elLastTxAsal = document.getElementById('lastTxAsal');
  const elLastTxTujuan = document.getElementById('lastTxTujuan');
  const elLastTxQty = document.getElementById('lastTxQty');
  const elLastTxMeta = document.getElementById('lastTxMeta');
  const elLastTxSyncBadge = document.getElementById('lastTxSyncBadge');
  const elPreviewEmptyState = document.getElementById('previewEmptyState');
  const elRecentTransfersList = document.getElementById('recentTransfersList');
  const elBtnUndoLastTransfer = document.getElementById('btnUndoLastTransfer');
  const elBtnViewAllHistoryFromPreview = document.getElementById('btnViewAllHistoryFromPreview');
  const elPreviewHistoryCount = document.getElementById('previewHistoryCount');

  // Modals
  const elModalBinPicker = document.getElementById('modalBinPicker');
  const elBtnCloseBinPicker = document.getElementById('btnCloseBinPicker');
  const elFilterBinSearch = document.getElementById('filterBinSearch');
  const elPickerTargetName = document.getElementById('pickerTargetName');
  const elBinPickerGrid = document.getElementById('binPickerGrid');

  const elModalCloudSettings = document.getElementById('modalCloudSettings');
  const elBtnOpenCloudSettings = document.getElementById('btnOpenCloudSettings');
  const elBtnCloseCloudSettings = document.getElementById('btnCloseCloudSettings');
  const elInputCloudUrl = document.getElementById('inputCloudUrl');
  const elBtnTestCloud = document.getElementById('btnTestCloudConnection');
  const elBtnSaveCloud = document.getElementById('btnSaveCloudSettings');
  const elCloudTestResult = document.getElementById('cloudTestResult');

  const elModalLabelGen = document.getElementById('modalLabelGen');
  const elBtnOpenLabelGen = document.getElementById('btnOpenLabelGen');
  const elBtnCloseLabelGen = document.getElementById('btnCloseLabelGen');
  const elBtnGenerateLabels = document.getElementById('btnGenerateBinLabels');
  const elLabelPreviewArea = document.getElementById('labelPreviewArea');

  const elModalCam = document.getElementById('modalCam');
  const elBtnOpenCam = document.getElementById('btnOpenCam');
  const elBtnCloseCam = document.getElementById('btnCloseCam');
  const elCamFileInput = document.getElementById('cameraSnapInput');
  const elBtnSnapPhoto = document.getElementById('btnSnapPhotoFallback');
  const elToast = document.getElementById('toast');

  // --- Toast Notification ---
  let toastTimer = null;
  function showToast(msg, isError = false) {
    if (!elToast) return;
    clearTimeout(toastTimer);
    elToast.textContent = msg;
    elToast.className = 'toast' + (isError ? ' error' : ' success');
    elToast.style.display = 'block';
    toastTimer = setTimeout(() => {
      elToast.style.display = 'none';
    }, 2800);
  }

  // --- Database Initialization ---
  function initDatabase() {
    if (window.WMS_DATABASE && window.WMS_DATABASE.items) {
      database = window.WMS_DATABASE;
      console.log('WMS Database ready:', Object.keys(database.items).length, 'items');
    } else if (window.PDT_DATABASE && window.PDT_DATABASE.items) {
      database = window.PDT_DATABASE;
      console.log('Using shared PDT_DATABASE');
    }
    updateGudangBadge();
  }

  // --- Location Lookup ---
  function findLocation(code) {
    if (!code || !database.lokasi) return null;
    const q = code.trim().toUpperCase();
    for (let i = 0; i < database.lokasi.length; i++) {
      const l = database.lokasi[i];
      if (l.c === q || (l.s && l.s.toUpperCase() === q)) return l;
    }
    return null;
  }

  function updateGudangBadge() {
    const lok = findLocation(state.gudang);
    if (lok) {
      elBadgeGudang.textContent = `🏬 ${lok.c} - ${lok.n} (${lok.s})`;
    } else {
      elBadgeGudang.textContent = `📍 Kode Toko/Gudang: ${state.gudang || '-'}`;
    }
  }

  // --- Format / Detect Bin Code ---
  // Format Standar Bos: A-001-1-001 (A=LORONG, 001=RAK, 1=LEVEL, 001=BIN/PALET)
  function isBinCode(text) {
    if (!text) return false;
    const clean = text.trim().toUpperCase();
    if (clean.startsWith('LOC:') || clean.startsWith('BIN:')) return true;
    // Format 8-char raw MASTER_RAK.DBF (misal: A0011001, C1111111, S9999999)
    if (/^[A-Z][0-9]{7}$/i.test(clean)) return true;
    // Format Ber-strip: A-001-1-001 (e.g. A-001-1-001, B-015-2-004)
    if (/^[A-Z0-9]{1,2}-[0-9]{3}-[0-9]{1,2}-[0-9]{3}$/i.test(clean)) return true;
    // Format 7 digit lama & general bin (e.g. ZA-02-3-01)
    if (/^[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{1,2}-[A-Z0-9]{2}$/i.test(clean)) return true;
    // Format RAK.DBF (e.g. AB/001-L1)
    if (/^[A-Z0-9]{2}\/[0-9]{3}(-L\d+)?$/i.test(clean)) return true;
    // Cek di index master bin resmi
    if (database.binIndex && (database.binIndex[clean] || database.binIndex[cleanBinCode(clean)])) return true;
    return false;
  }

  function cleanBinCode(text) {
    if (!text) return '';
    let clean = text.trim().toUpperCase().replace(/^(LOC:|BIN:)/i, '');
    // Konversi otomatis 8 karakter raw A0011001 -> A-001-1-001
    if (/^[A-Z][0-9]{7}$/i.test(clean)) {
      clean = `${clean[0]}-${clean.slice(1,4)}-${clean[4]}-${clean.slice(5,8)}`;
    }
    if (database.binIndex && database.binIndex[clean]) {
      return database.binIndex[clean];
    }
    return clean;
  }

  function getRackFromBin(bin) {
    if (!bin) return '-';
    const parts = bin.split('-');
    // Format: A-001-1-001 -> Rak: A-001
    if (parts.length >= 4) {
      return `${parts[0]}-${parts[1]}`;
    }
    if (bin.includes('/')) return bin.split('-')[0];
    if (parts.length >= 3) return parts[0] + '-' + parts[1] + '-' + parts[2];
    return bin;
  }

  // --- Product Lookup (Barcode / PLU / Article) ---
  function lookupProduct(query) {
    if (!query) return null;
    const clean = query.trim().toUpperCase();
    const noSpace = clean.replace(/\s+/g, '');

    // 1. Check Barcode Kemasan
    if (database.barcodes && database.barcodes[clean]) {
      const plu = database.barcodes[clean];
      const item = database.items[plu] || { n: `ITEM ${plu}`, a: '' };
      return {
        plu: plu,
        name: item.n,
        article: item.a,
        scannedCode: clean,
        source: 'barcode'
      };
    }

    // 2. Check PLU Langsung
    if (database.items && database.items[clean]) {
      const item = database.items[clean];
      return {
        plu: clean,
        name: item.n,
        article: item.a,
        scannedCode: clean,
        source: 'plu'
      };
    }

    // 3. Check Article Code (e.g. 68612 or ITTX-68612)
    if (database.articles) {
      const mappedPlu = database.articles[noSpace] || database.articles[clean];
      if (mappedPlu && database.items[mappedPlu]) {
        const item = database.items[mappedPlu];
        return {
          plu: mappedPlu,
          name: item.n,
          article: item.a || clean,
          scannedCode: clean,
          source: 'article'
        };
      }
    }

    return null;
  }

  // --- Live Item Preview ---
  function updateLiveItemPreview(code) {
    const rawVal = (code || '').trim();
    if (!rawVal) {
      elLiveItemCard.className = 'live-item-card';
      elLiveItemIcon.textContent = '📦';
      elLiveItemName.textContent = 'Nama barang akan otomatis muncul di sini...';
      elLiveItemMeta.textContent = 'Tembak barcode kemasan, ketik PLU, atau Article (misal: 68612)';
      return null;
    }

    if (isBinCode(rawVal)) {
      elLiveItemCard.className = 'live-item-card found';
      elLiveItemIcon.textContent = '📍';
      elLiveItemName.textContent = `LOKASI BIN: ${cleanBinCode(rawVal)}`;
      elLiveItemMeta.textContent = 'Kode alamat lokasi rak terdeteksi!';
      return null;
    }

    const found = lookupProduct(rawVal);
    if (found) {
      elLiveItemCard.className = 'live-item-card found';
      elLiveItemIcon.textContent = '✅';
      elLiveItemName.textContent = found.name;
      elLiveItemMeta.textContent = `PLU: ${found.plu} ${found.article ? '| Art: ' + found.article : ''} | Asal: ${found.source}`;
      return found;
    } else {
      elLiveItemCard.className = 'live-item-card';
      elLiveItemIcon.textContent = '❓';
      elLiveItemName.textContent = `[ITEM MANUAL: ${rawVal}]`;
      elLiveItemMeta.textContent = 'Produk tidak ditemukan di database master';
      return {
        plu: rawVal,
        name: `[ITEM MANUAL ${rawVal}]`,
        article: '',
        scannedCode: rawVal,
        source: 'manual'
      };
    }
  }

  // --- Execute Transfer / Move ---
  function executeTransfer() {
    const rawCode = elInputScanCode.value.trim();
    if (!rawCode) {
      showToast('Scan barcode / PLU barang terlebih dahulu!', true);
      playBeepError();
      elInputScanCode.focus();
      return;
    }

    // If accidentally scanned a bin code into the item input
    if (isBinCode(rawCode)) {
      handleScannedBin(rawCode);
      elInputScanCode.value = '';
      updateLiveItemPreview('');
      return;
    }

    // Validate Bins
    if (!state.binAsal || state.binAsal === '-') {
      showToast('Pilih Rak/Bin Asal terlebih dahulu!', true);
      playBeepError();
      return;
    }
    if (!state.binTujuan || state.binTujuan === '-') {
      showToast('Pilih Rak/Bin Tujuan terlebih dahulu!', true);
      playBeepError();
      return;
    }
    if (state.binAsal === state.binTujuan) {
      showToast('Bin Tujuan tidak boleh sama dengan Bin Asal!', true);
      playBeepError();
      return;
    }

    const currentQty = parseFloat(elInputQty.value) || 1.0;
    const item = lookupProduct(rawCode) || {
      plu: rawCode,
      name: `[ITEM MANUAL ${rawCode}]`,
      article: '',
      scannedCode: rawCode
    };

    const now = new Date();
    const timeFormatted = now.toISOString().replace('T', ' ').slice(0, 19);

    const txRecord = {
      action: 'transfer',
      timestamp: timeFormatted,
      gudang: state.gudang,
      petugas: state.petugas,
      deviceId: state.deviceId,
      rakAsal: getRackFromBin(state.binAsal),
      binAsal: state.binAsal,
      rakTujuan: getRackFromBin(state.binTujuan),
      binTujuan: state.binTujuan,
      plu: item.plu,
      article: item.article || '',
      barcode: item.scannedCode || rawCode,
      namaBarang: item.name,
      qty: currentQty,
      keterangan: 'Mutasi Antar Rak',
      cloudSynced: false
    };

    // Save to local history
    historyList.unshift(txRecord);
    saveHistory();
    renderHistory();

    // Add to Cloud Sync Queue
    syncQueue.push(txRecord);
    saveQueue();
    updateCloudStatusUI();

    playBeepSuccess();
    showToast(`✓ Berhasil memindahkan ${currentQty} pcs ${item.name}!`);

    // Reset QTY to 1 for next scan
    elInputQty.value = '1';
    elInputScanCode.value = '';
    updateLiveItemPreview('');
    elInputScanCode.focus();

    renderLiveTransferPreview();
    // Trigger Cloud Send
    triggerCloudSync();
  }

  // --- Handle Scanned Bin ---
  function handleScannedBin(rawBin) {
    const clean = cleanBinCode(rawBin);
    if (state.activeLocTarget === 'asal') {
      state.binAsal = clean;
      elDispBinAsal.textContent = clean;
      // Auto-toggle next target to tujuan
      state.activeLocTarget = 'tujuan';
      updateLocCardHighlight();
      playBeepLoc();
      showToast(`📍 Rak/Bin Asal diset: ${clean}`);
    } else {
      if (clean === state.binAsal) {
        showToast('Bin Tujuan tidak boleh sama dengan Bin Asal!', true);
        playBeepError();
        return;
      }
      state.binTujuan = clean;
      elDispBinTujuan.textContent = clean;
      playBeepLoc();
      showToast(`🎯 Rak/Bin Tujuan diset: ${clean}`);
    }
    saveSession();
  }

  function updateLocCardHighlight() {
    if (state.activeLocTarget === 'asal') {
      elCardLocAsal.classList.add('active-target');
      elCardLocTujuan.classList.remove('active-target');
    } else {
      elCardLocTujuan.classList.add('active-target');
      elCardLocAsal.classList.remove('active-target');
    }
  }

  // --- Real-time Cloud Sync Engine ---
  async function triggerCloudSync() {
    if (syncQueue.length === 0 || isSyncing) return;
    if (!state.cloudUrl) {
      updateCloudStatusUI('offline', `${syncQueue.length} Tertunda (Cloud URL Kosong)`);
      return;
    }

    isSyncing = true;
    updateCloudStatusUI('syncing', `Mengirim ${syncQueue.length} data...`);

    const batchToSend = [...syncQueue];

    try {
      // Send as text/plain to avoid CORS preflight in Google Apps Script
      const res = await fetch(state.cloudUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ batch: batchToSend })
      });

      const json = await res.json();
      if (json && json.status === 'success') {
        // Mark items as synced
        batchToSend.forEach(b => {
          b.cloudSynced = true;
          const histMatch = historyList.find(h => h.timestamp === b.timestamp && h.plu === b.plu);
          if (histMatch) histMatch.cloudSynced = true;
        });
        syncQueue = syncQueue.filter(q => !batchToSend.includes(q));
        saveQueue();
        saveHistory();
        renderHistory();
        updateCloudStatusUI('online', 'Cloud Tersinkron');
        renderLiveTransferPreview();
      } else {
        throw new Error(json.message || 'Gagal menyimpan ke cloud');
      }
    } catch (err) {
      console.warn('Cloud sync error (will retry automatically):', err);
      updateCloudStatusUI('offline', `${syncQueue.length} Tertunda (Offline)`);
    } finally {
      isSyncing = false;
    }
  }

  function updateCloudStatusUI(status = 'online', text = 'Cloud Siap') {
    if (syncQueue.length > 0) {
      elCloudDot.className = 'cloud-dot syncing';
      elCloudStatusText.textContent = `${syncQueue.length} Pending Sync`;
      elPendingQueueCount.textContent = `${syncQueue.length} Pending`;
    } else if (status === 'offline') {
      elCloudDot.className = 'cloud-dot offline';
      elCloudStatusText.textContent = text;
      elPendingQueueCount.textContent = 'Offline';
    } else {
      elCloudDot.className = 'cloud-dot online';
      elCloudStatusText.textContent = text;
      elPendingQueueCount.textContent = '0 Pending';
    }
  }

  // --- History Rendering ---

  // --- Live Transfer Preview Rendering (Tab Mutasi Rak) ---
  function renderLiveTransferPreview() {
    if (!elDispTotalPindahSesi) return;

    const transfers = historyList.filter(h => h.action === 'transfer');
    const totalCount = transfers.length;
    let totalQty = 0;
    transfers.forEach(t => { totalQty += (parseFloat(t.qty) || 0); });

    elDispTotalPindahSesi.textContent = `${totalCount} Item (${totalQty.toFixed(0)} Pcs)`;
    if (elPreviewHistoryCount) elPreviewHistoryCount.textContent = totalCount;

    if (totalCount === 0) {
      if (elPreviewEmptyState) elPreviewEmptyState.style.display = 'block';
      if (elLastTransferHighlight) elLastTransferHighlight.style.display = 'none';
      if (elRecentTransfersList) elRecentTransfersList.innerHTML = '';
      if (elBtnUndoLastTransfer) elBtnUndoLastTransfer.style.display = 'none';
      return;
    }

    if (elPreviewEmptyState) elPreviewEmptyState.style.display = 'none';
    if (elBtnUndoLastTransfer) elBtnUndoLastTransfer.style.display = 'inline-flex';

    // Highlight perpindahan paling baru
    const last = transfers[0];
    if (elLastTransferHighlight && last) {
      elLastTransferHighlight.style.display = 'block';
      const timeOnly = last.timestamp.includes(' ') ? last.timestamp.split(' ')[1] : last.timestamp;
      if (elLastTxTime) elLastTxTime.textContent = timeOnly;
      if (elLastTxTitle) elLastTxTitle.textContent = last.namaBarang;
      if (elLastTxAsal) elLastTxAsal.textContent = last.binAsal;
      if (elLastTxTujuan) elLastTxTujuan.textContent = last.binTujuan;
      if (elLastTxQty) elLastTxQty.textContent = `+${parseFloat(last.qty).toFixed(0)} PCS`;
      if (elLastTxMeta) {
        elLastTxMeta.textContent = `PLU: ${last.plu}${last.article ? ' | Art: ' + last.article : ''} | Barcode: ${last.barcode}`;
      }
      if (elLastTxSyncBadge) {
        elLastTxSyncBadge.className = last.cloudSynced ? 'badge-cloud-synced' : 'badge-cloud-pending';
        elLastTxSyncBadge.innerHTML = last.cloudSynced ? '☁️ Cloud' : '⏳ Pending';
      }
    }

    // List 4 transaksi sebelumnya di sesi ini
    if (elRecentTransfersList) {
      const remaining = transfers.slice(1, 5);
      if (remaining.length === 0) {
        elRecentTransfersList.innerHTML = '';
      } else {
        let html = '';
        remaining.forEach(item => {
          const tOnly = item.timestamp.includes(' ') ? item.timestamp.split(' ')[1] : item.timestamp;
          const cloudBadge = item.cloudSynced ? '✓ Cloud' : '⏳ Pending';
          html += `
            <div class="recent-tx-row">
              <div class="recent-tx-left">
                <div class="recent-tx-title">${escapeHtml(item.namaBarang)}</div>
                <div class="recent-tx-path">📍 ${escapeHtml(item.binAsal)} ➔ 🎯 ${escapeHtml(item.binTujuan)}</div>
                <div class="recent-tx-meta">
                  <span>⏱️ ${escapeHtml(tOnly)}</span>
                  <span>| PLU: ${escapeHtml(item.plu)}</span>
                  <span style="color: ${item.cloudSynced ? '#059669' : '#d97706'}; font-weight: 800;">${cloudBadge}</span>
                </div>
              </div>
              <div class="recent-tx-qty">+${parseFloat(item.qty).toFixed(0)}</div>
            </div>
          `;
        });
        elRecentTransfersList.innerHTML = html;
      }
    }
  }

  // --- Undo Last Transfer ---
  function undoLastTransfer() {
    const lastTransferIdx = historyList.findIndex(h => h.action === 'transfer');
    if (lastTransferIdx === -1) {
      showToast('Tidak ada perpindahan yang dapat dibatalkan.', true);
      return;
    }

    const item = historyList[lastTransferIdx];
    const confirmMsg = `Batalkan perpindahan terakhir:\n${item.namaBarang}\nSebanyak ${item.qty} pcs (${item.binAsal} ➔ ${item.binTujuan})?`;
    if (!confirm(confirmMsg)) return;

    // Hapus dari historyList
    historyList.splice(lastTransferIdx, 1);

    // Hapus dari syncQueue jika belum terkirim
    syncQueue = syncQueue.filter(q => !(q.timestamp === item.timestamp && q.plu === item.plu && q.binAsal === item.binAsal && q.binTujuan === item.binTujuan));

    // Jika sudah tersinkron ke Cloud, buat record pembalikan (reversal)
    if (item.cloudSynced && state.cloudUrl) {
      const reversalRecord = {
        action: 'transfer',
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        gudang: state.gudang,
        petugas: state.petugas,
        deviceId: state.deviceId,
        rakAsal: item.rakTujuan,
        binAsal: item.binTujuan,
        rakTujuan: item.rakAsal,
        binTujuan: item.binAsal,
        plu: item.plu,
        article: item.article || '',
        barcode: item.barcode || '',
        namaBarang: item.namaBarang,
        qty: item.qty,
        keterangan: 'BATAL / REVERSAL PINDAH RAK',
        cloudSynced: false
      };
      syncQueue.push(reversalRecord);
      triggerCloudSync();
    }

    saveHistory();
    saveQueue();
    renderHistory();
    renderLiveTransferPreview();
    updateCloudStatusUI();
    playBeepLoc();
    showToast(`↩️ Perpindahan ${item.namaBarang} dibatalkan.`);
  }


  // --- Export Hasil Scan Mutasi ke File TXT ---
  function exportTransfersToTxt() {
    if (!historyList || historyList.length === 0) {
      showToast('Belum ada data mutasi untuk diunduh.', true);
      return;
    }

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yymmdd = `${yy}${mm}${dd}`;
    const toko = (state.gudang || '55022').trim();
    const dev = (state.deviceId || 'PDT01').trim().replace(/[^a-zA-Z0-9_-]/g, '');

    const filename = `mutasi_${toko}_${yymmdd}_${dev}.txt`;

    // Format baris: BARCODE/PLU,QTY,BIN_ASAL,BIN_TUJUAN,TIMESTAMP,PETUGAS
    let lines = [];
    historyList.forEach(item => {
      const code = item.barcode || item.plu;
      const qty = parseFloat(item.qty).toFixed(2);
      const binAsal = item.binAsal || '-';
      const binTujuan = item.binTujuan || '-';
      const time = item.timestamp || '';
      const petugas = item.petugas || state.petugas || '';

      lines.push(`${code},${qty},${binAsal},${binTujuan},${time},${petugas}`);
    });

    const content = lines.join('\r\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`✓ File ${filename} (${historyList.length} transaksi) berhasil diunduh!`);
  }

  function renderHistory() {
    elTabCountHistory.textContent = historyList.length;
    renderLiveTransferPreview();
    if (historyList.length === 0) {
      elHistoryContainer.innerHTML = `
        <div style="text-align: center; color: #94a3b8; padding: 24px;">
          <div style="font-size: 32px; margin-bottom: 6px;">📋</div>
          <div>Belum ada transaksi mutasi sesi ini</div>
        </div>
      `;
      return;
    }

    let html = '';
    historyList.forEach((h, idx) => {
      html += `
        <div class="history-item">
          <div class="history-item-left">
            <div class="history-item-title">${escapeHtml(h.namaBarang)}</div>
            <div class="history-item-route">
              📍 ${escapeHtml(h.binAsal)} ➔ 🎯 ${escapeHtml(h.binTujuan)}
            </div>
            <div class="history-item-meta">
              PLU: <strong>${escapeHtml(h.plu)}</strong> ${h.article ? '| Art: ' + escapeHtml(h.article) : ''} | ⏱️ ${escapeHtml(h.timestamp)}
              ${h.cloudSynced ? '<span class="badge-cloud-synced">☁️ Tersinkron</span>' : '<span class="badge-cloud-pending">⏳ Pending Cloud</span>'}
            </div>
          </div>
          <div class="history-item-qty">
            ${parseFloat(h.qty).toFixed(2)}
          </div>
        </div>
      `;
    });
    elHistoryContainer.innerHTML = html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- Session & Storage ---
  function saveSession() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function loadSession() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const obj = JSON.parse(saved);
        if (obj.gudang) state.gudang = obj.gudang;
        if (obj.petugas) state.petugas = obj.petugas;
        if (obj.deviceId) state.deviceId = obj.deviceId;
        if (obj.binAsal) state.binAsal = obj.binAsal;
        if (obj.binTujuan) state.binTujuan = obj.binTujuan;
        if (obj.cloudUrl) state.cloudUrl = obj.cloudUrl;
      }
      const savedHist = localStorage.getItem(HISTORY_KEY);
      if (savedHist) historyList = JSON.parse(savedHist);
      const savedQueue = localStorage.getItem(QUEUE_KEY);
      if (savedQueue) syncQueue = JSON.parse(savedQueue);
    } catch (e) {}

    elInputGudang.value = state.gudang;
    elInputPetugas.value = state.petugas;
    elInputDevice.value = state.deviceId;
    elDispBinAsal.textContent = state.binAsal;
    elDispBinTujuan.textContent = state.binTujuan;
    if (elInputCloudUrl) elInputCloudUrl.value = state.cloudUrl;

    updateGudangBadge();
    updateLocCardHighlight();
    renderHistory();
    updateCloudStatusUI();
  }

  function saveHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(historyList.slice(0, 100))); } catch (e) {}
  }

  function saveQueue() {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(syncQueue)); } catch (e) {}
  }

  // --- Bin Picker Modal ---
  function openBinPicker(target = 'asal') {
    state.activeLocTarget = target;
    elPickerTargetName.textContent = target === 'asal' ? 'RAK / BIN ASAL' : 'RAK / BIN TUJUAN';
    renderBinPickerGrid('');
    elModalBinPicker.classList.add('active');
  }

  function renderBinPickerGrid(query = '') {
    const q = (query || '').trim().toUpperCase();
    const bins = database.defaultBins || [];
    let filtered = bins.filter(b => !q || b.code.includes(q) || (b.desc && b.desc.toUpperCase().includes(q)));
    if (filtered.length === 0) {
      // Fallback: show custom typed bin
      filtered = [{ code: q || 'A-001-1-001', desc: 'Bin Kustom' }];
    }

    let html = '';
    filtered.slice(0, 60).forEach(b => {
      html += `
        <button type="button" class="qty-chip select-bin-btn" data-bin="${b.code}" style="padding: 10px 6px; text-align: center; border-radius: 8px;">
          <div style="font-weight: 900; font-size: 0.88rem; color: #0284c7;">${escapeHtml(b.code)}</div>
          <div style="font-size: 0.65rem; color: #64748b; margin-top: 2px;">${escapeHtml(b.desc || '')}</div>
        </button>
      `;
    });
    elBinPickerGrid.innerHTML = html;
  }

  // --- Barcode Label Generator: A-001-1-001 ---
  function generateBinLabels() {
    const elLorong = document.getElementById('genLorong');
    const elRak = document.getElementById('genRak');
    const elLevels = document.getElementById('genLevels');
    const elBins = document.getElementById('genBinsPerLevel');

    const lorong = (elLorong ? elLorong.value.trim().toUpperCase() : '') || 'A';
    const rakNo = parseInt(elRak ? elRak.value : 1) || 1;
    const levels = parseInt(elLevels ? elLevels.value : 3) || 3;
    const binsPerLevel = parseInt(elBins ? elBins.value : 4) || 4;

    let html = '';
    for (let l = 1; l <= levels; l++) {
      for (let b = 1; b <= binsPerLevel; b++) {
        const binCode = `${lorong}-${String(rakNo).padStart(3, '0')}-${l}-${String(b).padStart(3, '0')}`;
        html += `
          <div class="barcode-label-card">
            <div class="barcode-label-title">${binCode}</div>
            <div style="font-family: monospace; font-size: 26px; letter-spacing: 2px; line-height: 1.1; margin: 4px 0;">
              ||| | |||| | ||| |
            </div>
            <div class="barcode-label-sub">Lorong ${lorong} - Rak ${String(rakNo).padStart(3, '0')} - Tk.${l} - Bin ${String(b).padStart(3, '0')}</div>
          </div>
        `;
      }
    }
    elLabelPreviewArea.innerHTML = html;
  }

  // --- Event Listeners Setup ---
  function initEvents() {
    // Nav Tabs
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tc => tc.style.display = 'none');
        this.classList.add('active');
        const targetTab = this.getAttribute('data-tab');
        document.getElementById(targetTab).style.display = 'block';
        state.activeTab = targetTab;
      });
    });

    // Toggle Header
    elBtnToggleHeader.addEventListener('click', () => {
      const isHidden = elHeaderCardBody.style.display === 'none';
      elHeaderCardBody.style.display = isHidden ? 'block' : 'none';
      elHeaderToggleIcon.textContent = isHidden ? '▼ Sembunyikan' : '▲ Buka Parameter';
    });

    // Input changes
    elInputGudang.addEventListener('input', () => { state.gudang = elInputGudang.value.trim(); updateGudangBadge(); saveSession(); });
    elInputPetugas.addEventListener('input', () => { state.petugas = elInputPetugas.value.trim(); saveSession(); });
    elInputDevice.addEventListener('input', () => { state.deviceId = elInputDevice.value.trim(); saveSession(); });

    // Location Cards Click
    elCardLocAsal.addEventListener('click', () => {
      openBinPicker('asal');
    });
    elCardLocTujuan.addEventListener('click', () => {
      openBinPicker('tujuan');
    });

    // Swap Locations Button
    elBtnSwapLocations.addEventListener('click', () => {
      const temp = state.binAsal;
      state.binAsal = state.binTujuan;
      state.binTujuan = temp;
      elDispBinAsal.textContent = state.binAsal;
      elDispBinTujuan.textContent = state.binTujuan;
      saveSession();
      playBeepLoc();
      showToast('⇄ Posisi Rak Asal & Tujuan dibalik');
    });

    elBtnOpenBinPicker.addEventListener('click', () => {
      openBinPicker(state.activeLocTarget);
    });

    // Bin Picker Grid Click Delegation
    elBinPickerGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.select-bin-btn');
      if (!btn) return;
      const bin = btn.getAttribute('data-bin');
      handleScannedBin(bin);
      elModalBinPicker.classList.remove('active');
    });

    elFilterBinSearch.addEventListener('input', () => {
      renderBinPickerGrid(elFilterBinSearch.value);
    });

    elBtnCloseBinPicker.addEventListener('click', () => elModalBinPicker.classList.remove('active'));

    // QTY Buttons
    elBtnQtyMinus.addEventListener('click', () => {
      let q = parseFloat(elInputQty.value) || 1;
      if (q > 1) elInputQty.value = q - 1;
    });
    elBtnQtyPlus.addEventListener('click', () => {
      let q = parseFloat(elInputQty.value) || 0;
      elInputQty.value = q + 1;
    });

    document.querySelectorAll('.qty-chip[data-qty]').forEach(chip => {
      chip.addEventListener('click', function () {
        const q = this.getAttribute('data-qty');
        elInputQty.value = q;
        showToast(`QTY diset: ${q}`);
        elInputScanCode.focus();
      });
    });

    // Live Item Preview typing & Hardware Scanner Auto-Submit (Honeywell EDA50 CR/LF)
    elInputScanCode.addEventListener('input', () => {
      const raw = elInputScanCode.value;
      if (raw.includes('\n') || raw.includes('\r')) {
        elInputScanCode.value = raw.replace(/[\r\n]+/g, '').trim();
        executeTransfer();
        return;
      }
      updateLiveItemPreview(raw);
    });

    elInputScanCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.keyCode === 13 || e.which === 13) {
        e.preventDefault();
        executeTransfer();
      }
    });

    elBtnSubmitTransfer.addEventListener('click', executeTransfer);

    // Putaway Submission
    const btnSubmitPutaway = document.getElementById('btnSubmitPutaway');
    if (btnSubmitPutaway) {
      btnSubmitPutaway.addEventListener('click', () => {
        const bin = document.getElementById('inputPutawayBin').value.trim();
        const code = document.getElementById('inputPutawayScan').value.trim();
        const qty = parseFloat(document.getElementById('inputPutawayQty').value) || 1.0;
        if (!bin || !code) {
          showToast('Isi Bin Tujuan dan Scan Barang!', true);
          return;
        }
        const item = lookupProduct(code) || { plu: code, name: `[ITEM ${code}]`, scannedCode: code };
        const txRecord = {
          action: 'putaway',
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
          gudang: state.gudang,
          petugas: state.petugas,
          deviceId: state.deviceId,
          rakAsal: '-',
          binAsal: '-',
          rakTujuan: getRackFromBin(bin),
          binTujuan: bin,
          plu: item.plu,
          article: item.article || '',
          barcode: item.scannedCode || code,
          namaBarang: item.name,
          qty: qty,
          keterangan: 'Putaway Inbound',
          cloudSynced: false
        };
        historyList.unshift(txRecord);
        saveHistory();
        renderHistory();
        syncQueue.push(txRecord);
        saveQueue();
        updateCloudStatusUI();
        playBeepSuccess();
        showToast(`✓ Putaway ${qty} pcs ke ${bin} sukses!`);
        document.getElementById('inputPutawayScan').value = '';
        triggerCloudSync();
      });
    }

    // Cloud Settings Modal
    elBtnOpenCloudSettings.addEventListener('click', () => elModalCloudSettings.classList.add('active'));
    elBtnCloseCloudSettings.addEventListener('click', () => elModalCloudSettings.classList.remove('active'));

    elBtnSaveCloud.addEventListener('click', () => {
      state.cloudUrl = elInputCloudUrl.value.trim();
      saveSession();
      elModalCloudSettings.classList.remove('active');
      showToast('Pengaturan Cloud API berhasil disimpan!');
      triggerCloudSync();
    });

    elBtnTestCloud.addEventListener('click', async () => {
      const url = elInputCloudUrl.value.trim();
      if (!url) {
        elCloudTestResult.style.display = 'block';
        elCloudTestResult.style.color = '#dc2626';
        elCloudTestResult.textContent = '❌ Masukkan URL Web App terlebih dahulu!';
        return;
      }
      elCloudTestResult.style.display = 'block';
      elCloudTestResult.style.color = '#0284c7';
      elCloudTestResult.textContent = '⏳ Menghubungi Cloud Spreadsheet...';

      try {
        const pingUrl = url + (url.includes('?') ? '&' : '?') + 'action=ping';
        const res = await fetch(pingUrl);
        const data = await res.json();
        if (data && data.status === 'ok') {
          elCloudTestResult.style.color = '#16a34a';
          elCloudTestResult.textContent = `✅ Terhubung: ${data.service} (${data.spreadsheetName || 'OK'})`;
        } else {
          throw new Error('Respon tidak valid');
        }
      } catch (err) {
        elCloudTestResult.style.color = '#dc2626';
        elCloudTestResult.textContent = '❌ Gagal terhubung ke URL tersebut. Periksa izin "Anyone" pada Web App.';
      }
    });

    elBtnSyncNow.addEventListener('click', triggerCloudSync);

    // Label Generator Modal
    elBtnOpenLabelGen.addEventListener('click', () => {
      generateBinLabels();
      elModalLabelGen.classList.add('active');
    });
    elBtnCloseLabelGen.addEventListener('click', () => elModalLabelGen.classList.remove('active'));
    elBtnGenerateLabels.addEventListener('click', generateBinLabels);

    // Clear History
    // Tombol Ekspor TXT
    const btnExportTxt = document.getElementById('btnExportTxt');
    if (btnExportTxt) btnExportTxt.addEventListener('click', exportTransfersToTxt);

    const btnQuickExportTxt = document.getElementById('btnQuickExportTxt');
    if (btnQuickExportTxt) btnQuickExportTxt.addEventListener('click', exportTransfersToTxt);

    elBtnClearHistory.addEventListener('click', () => {
      if (confirm('Bersihkan riwayat mutasi di layar? (Data yang sudah terkirim ke Cloud tetap aman di Spreadsheet)')) {
        historyList = [];
        saveHistory();
        renderHistory();
        renderLiveTransferPreview();
        showToast('Riwayat dibersihkan.');
      }
    });

    // Camera Scanner Setup
    if (elBtnOpenCam) {
      elBtnOpenCam.addEventListener('click', openCameraModal);
    }
    if (elBtnCloseCam) {
      elBtnCloseCam.addEventListener('click', closeCameraModal);
    }
    if (elBtnSnapPhoto && elCamFileInput) {
      elBtnSnapPhoto.addEventListener('click', () => elCamFileInput.click());
    }
    if (elCamFileInput) {
      elCamFileInput.addEventListener('change', (e) => {
        if (!e.target.files || !e.target.files.length) return;
        const file = e.target.files[0];
        showToast('Memindai barcode dari foto...');

        const Html5Qr = getHtml5QrcodeClass();
        if (!Html5Qr) {
          alert('Modul kamera belum siap.');
          return;
        }

        if (!html5QrCode) html5QrCode = new Html5Qr('reader');
        html5QrCode.scanFile(file, true)
          .then(decodedText => {
            playBeepSuccess();
            closeCameraModal();
            onBarcodeScanned(decodedText);
          })
          .catch(() => {
            playBeepError();
            alert('Barcode tidak terdeteksi dari foto.');
          });
      });
    }
  }

  function onBarcodeScanned(text) {
    if (isBinCode(text)) {
      handleScannedBin(text);
    } else {
      elInputScanCode.value = text;
      updateLiveItemPreview(text);
      executeTransfer();
    }
  }

  // Camera Helper
  function getHtml5QrcodeClass() {
    if (typeof window !== 'undefined') {
      if (typeof window.Html5Qrcode !== 'undefined') return window.Html5Qrcode;
      if (window.__Html5QrcodeLibrary__ && window.__Html5QrcodeLibrary__.Html5Qrcode) {
        return window.__Html5QrcodeLibrary__.Html5Qrcode;
      }
    }
    if (typeof Html5Qrcode !== 'undefined') return Html5Qrcode;
    return null;
  }

  function openCameraModal() {
    elModalCam.classList.add('active');
    startCamera();
  }

  function closeCameraModal() {
    if (html5QrCode && html5QrCode.isScanning) {
      html5QrCode.stop().catch(() => {});
    }
    elModalCam.classList.remove('active');
  }

  async function startCamera() {
    const Html5Qr = getHtml5QrcodeClass();
    const loading = document.getElementById('camLoadingIndicator');
    if (!Html5Qr) {
      if (loading) loading.innerHTML = '<div>Modul Kamera Belum Siap</div>';
      return;
    }
    if (!html5QrCode) html5QrCode = new Html5Qr('reader');

    try {
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 260, height: 160 } },
        (decodedText) => {
          playBeepSuccess();
          closeCameraModal();
          onBarcodeScanned(decodedText);
        },
        () => {}
      );
      if (loading) loading.style.display = 'none';
    } catch (e) {
      if (loading) {
        loading.innerHTML = `
          <div style="padding: 12px;">
            <div style="font-size: 30px; margin-bottom: 6px;">📷</div>
            <div style="font-weight: 800;">Kamera Video Tidak Tersedia</div>
            <div style="font-size: 0.74rem; color: #cbd5e1; margin-top: 6px;">Gunakan tombol <strong>[Ambil Foto Barcode]</strong> di bawah.</div>
          </div>
        `;
      }
    }
  }

  // --- Startup ---
  window.addEventListener('DOMContentLoaded', () => {
    initDatabase();
    loadSession();
    initEvents();
    setTimeout(() => {
      if (elInputScanCode) elInputScanCode.focus();
    }, 300);
  });

  // Global Scope Helper for debugging/testing
  window.ITX_WMS = {
    state,
    database,
    executeTransfer,
    lookupProduct,
    isBinCode,
    triggerCloudSync
  };

})();
