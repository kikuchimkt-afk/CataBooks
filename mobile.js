// Mobile JS for BestOne DB - Supabase Version

const DEFAULT_SETTINGS = {
    schoolName: 'ECCベストワン藍住・北島中央',
    address: '〒771-1252 徳島県板野郡藍住町矢上字北分82-1 テナント新居NO.4',
    phone: '088-692-5483',
    taxRate: 0.10,
    shippingFee: 0
};

// Data & State
let enhancedData = [];
let pendingQuoteStudentId = null;
let mobileQuoteTrigger = null;
let mobileSettingsTrigger = null;
let currentState = {
    search: '',
    filterLevel: 'all',
    filterSubject: 'all',
    tab: 'home',
    students: [],
    currentStudentId: null,
    currentCart: [],
    favorites: [],
    settings: { ...DEFAULT_SETTINGS }
};

// Tag estimation
function estimateTagsFromTitle(title) {
    if (!title) return { level: 'unknown', subject: 'unknown', special: [] };
    let level = 'unknown', subject = 'unknown', special = [];
    const t = title.toLowerCase();
    if (t.includes('小') || t.includes('小学')) level = 'elementary';
    if (t.includes('中') || t.includes('中学') || t.includes('高校入試')) level = 'junior';
    if (t.includes('高') || t.includes('高校') || t.includes('大学入試')) level = 'high';
    if (t.includes('英')) subject = 'english';
    if (t.includes('数') || t.includes('算')) subject = 'math';
    if (t.includes('国') || t.includes('文') || t.includes('漢字')) subject = 'japanese';
    if (t.includes('理') || t.includes('物') || t.includes('化') || t.includes('生')) subject = 'science';
    if (t.includes('社') || t.includes('史') || t.includes('地') || t.includes('公')) subject = 'social';
    if (t.includes('英検')) special.push('eiken');
    if (t.includes('受験') || t.includes('入試')) special.push('exam');
    if (t.includes('講習')) special.push('season');
    return { level, subject, special };
}

function normalizeSearchText(value) {
    if (!value) return '';
    try {
        return value.normalize('NFKC').toLowerCase();
    } catch (e) {
        return String(value).toLowerCase();
    }
}

function getSearchKeywords(rawSearch) {
    return normalizeSearchText(rawSearch).split(/[\s\u3000]+/).filter(k => k);
}

function matchesSearch(item, rawSearch) {
    const keywords = getSearchKeywords(rawSearch);
    if (keywords.length === 0) return true;
    const haystack = normalizeSearchText(`${item.title || ''} ${item.id || ''}`);
    return keywords.every(keyword => haystack.includes(keyword));
}

function searchRelevanceScore(item, rawSearch) {
    const keywords = getSearchKeywords(rawSearch);
    if (keywords.length === 0) return 0;
    const title = normalizeSearchText(item.title || '');
    const compact = title.replace(/[\s\u3000]+/g, '');
    const joined = keywords.join('');
    if (compact === joined) return 0;
    const idx = compact.indexOf(joined);
    if (idx === 0) return 1;
    if (idx > 0) return 10 + idx;
    return 100 + compact.length;
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();
    await loadAllData();
    renderHeaderStudent();
    renderContent();
    updateCartBadge();
    setupEventListeners();

    // Realtime
    subscribeToChanges(
        () => { reloadMaterials(); },
        () => { reloadStudentsData(); },
        () => { reloadCartData(); }
    );
});

// Data Loading
async function loadAllData() {
    try {
        const materials = await loadMaterials();
        enhancedData = materials.map(item => ({ ...item, ...estimateTagsFromTitle(item.title) }));

        currentState.students = await loadStudents();

        const savedId = sessionStorage.getItem('currentStudentId');
        if (savedId && currentState.students.some(s => s.id === savedId)) {
            currentState.currentStudentId = savedId;
        } else if (currentState.students.length > 0) {
            currentState.currentStudentId = currentState.students[0].id;
        }

        if (currentState.currentStudentId) {
            currentState.currentCart = await getCart(currentState.currentStudentId);
        }

        currentState.favorites = await getFavorites();

        const settings = await loadSettings();
        const hasSetting = (key) => Object.prototype.hasOwnProperty.call(settings, key);
        currentState.settings = {
            ...DEFAULT_SETTINGS,
            ...settings,
            schoolName: hasSetting('schoolName') ? settings.schoolName : DEFAULT_SETTINGS.schoolName,
            address: hasSetting('address') ? settings.address : DEFAULT_SETTINGS.address,
            phone: hasSetting('phone') ? settings.phone : DEFAULT_SETTINGS.phone,
            taxRate: QuoteUtils.normalizeTaxRate(settings.taxRate),
            shippingFee: QuoteUtils.normalizeShippingFee(settings.shippingFee)
        };
    } catch (e) {
        console.error('[Mobile] Load error:', e);
    }
}

async function reloadMaterials() {
    const materials = await loadMaterials();
    enhancedData = materials.map(item => ({ ...item, ...estimateTagsFromTitle(item.title) }));
    if (currentState.tab === 'home' || currentState.tab === 'favorites') renderContent();
}

async function reloadStudentsData() {
    currentState.students = await loadStudents();
    renderHeaderStudent();
    if (currentState.currentStudentId && !currentState.students.some(s => s.id === currentState.currentStudentId)) {
        currentState.currentStudentId = currentState.students.length > 0 ? currentState.students[0].id : null;
        sessionStorage.setItem('currentStudentId', currentState.currentStudentId || '');
        await reloadCartData();
    }
}

async function reloadCartData() {
    if (currentState.currentStudentId) {
        currentState.currentCart = await getCart(currentState.currentStudentId);
    } else {
        currentState.currentCart = [];
    }
    updateCartBadge();
    if (currentState.tab === 'cart') renderContent();
}

// Rendering
function renderContent() {
    const container = document.getElementById('itemList');
    container.innerHTML = '';
    removeCartFooter();

    if (currentState.tab === 'home') renderHomeItems(container);
    else if (currentState.tab === 'favorites') renderFavorites(container);
    else if (currentState.tab === 'cart') renderCart(container);
}

function renderHomeItems(container) {
    let items = enhancedData.filter(item => {
        if (!matchesSearch(item, currentState.search)) return false;
        if (currentState.filterLevel !== 'all' && item.level !== currentState.filterLevel) return false;
        if (currentState.filterSubject !== 'all' && item.subject !== currentState.filterSubject) return false;
        return true;
    });

    items.sort((a, b) => searchRelevanceScore(a, currentState.search) - searchRelevanceScore(b, currentState.search));

    const displayLimit = currentState.search ? 300 : 50;
    const displayItems = items.slice(0, displayLimit);

    if (displayItems.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><p>該当する教材がありません</p></div>';
        return;
    }

    displayItems.forEach(item => container.appendChild(createItemCard(item)));

    if (items.length > displayLimit) {
        const more = document.createElement('div');
        more.style.cssText = 'text-align:center; padding:10px; color:#999;';
        more.innerText = `他 ${items.length - displayLimit} 件 (キーワードを足して絞り込んでください)`;
        container.appendChild(more);
    }
}

function renderFavorites(container) {
    const favItems = enhancedData.filter(item => currentState.favorites.includes(item.id));
    if (favItems.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-regular fa-star"></i><p>お気に入りはまだありません</p></div>';
        return;
    }
    favItems.forEach(item => container.appendChild(createItemCard(item)));
}

function renderCart(container) {
    if (!currentState.currentStudentId) {
        container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-user-xmark"></i><p>生徒が選択されていません</p>
            <button class="btn-sm" style="margin-top:10px; font-size:16px;" onclick="openStudentModal()">生徒を選択</button></div>`;
        removeCartFooter();
        return;
    }

    if (currentState.currentCart.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-cart-shopping"></i><p>カートは空です</p></div>';
        removeCartFooter();
        return;
    }

    container.style.paddingBottom = '100px';

    currentState.currentCart.forEach(item => {
        const div = document.createElement('div');
        div.className = 'item-card';
        div.innerHTML = `
            <div class="item-main">
                <div class="item-title">${item.title}</div>
                <div class="item-price">¥${(item.price_retail || 0).toLocaleString()}</div>
            </div>
            <div class="item-actions">
                <button class="btn-sm" style="background:#fee2e2; color:#ef4444;" data-id="${item.id}">
                    <i class="fa-solid fa-trash"></i> 削除
                </button>
            </div>`;
        div.querySelector('button[data-id]').addEventListener('click', () => removeFromCartMobile(item.id));
        container.appendChild(div);
    });

    renderCartFooter();
}

function removeCartFooter() {
    const existing = document.querySelector('.cart-footer-actions');
    if (existing) existing.remove();
}

function renderCartFooter() {
    removeCartFooter();
    const quote = QuoteUtils.calculateQuote(currentState.currentCart, currentState.settings, false);
    const footer = document.createElement('div');
    footer.className = 'cart-footer-actions';
    footer.innerHTML = `
        <div class="cart-total"><span>教材小計</span><span>${formatYen(quote.itemsSubtotal)}</span></div>
        <button class="btn-checkout" id="btnCheckout">見積書を作成</button>`;
    document.querySelector('.app-container').appendChild(footer);
    document.getElementById('btnCheckout').addEventListener('click', () => {
        const student = currentState.students.find(s => s.id === currentState.currentStudentId);
        if (student) openQuoteOptions(student);
    });
}

function formatYen(amount) {
    return `¥${QuoteUtils.normalizeYen(amount).toLocaleString()}`;
}

function openQuoteOptions(student) {
    if (!student || currentState.currentCart.length === 0) return;

    pendingQuoteStudentId = student.id;
    mobileQuoteTrigger = document.activeElement;
    const modal = document.getElementById('mobileQuoteOptionsModal');
    const includeShipping = document.getElementById('mobileQuoteIncludeShipping');
    const configuredShippingFee = QuoteUtils.normalizeShippingFee(currentState.settings.shippingFee);

    document.getElementById('mobileQuoteStudentName').textContent = `${student.name} 様`;
    includeShipping.checked = configuredShippingFee > 0;
    includeShipping.disabled = configuredShippingFee === 0;

    const shippingOption = includeShipping.closest('.quote-shipping-option');
    if (shippingOption) shippingOption.classList.toggle('is-disabled', configuredShippingFee === 0);

    document.getElementById('mobileQuoteShippingDescription').textContent = configuredShippingFee > 0
        ? `設定送料 ${formatYen(configuredShippingFee)}（税込）`
        : '設定画面で送料を登録してください';

    updateQuoteOptionsSummary();
    modal.hidden = false;
    modal.classList.add('active');
    setTimeout(() => {
        const focusTarget = configuredShippingFee > 0
            ? includeShipping
            : document.getElementById('confirmMobileQuoteBtn');
        focusTarget.focus();
    }, 50);
}

function closeQuoteOptions() {
    const modal = document.getElementById('mobileQuoteOptionsModal');
    modal.classList.remove('active');
    modal.hidden = true;
    pendingQuoteStudentId = null;
    if (mobileQuoteTrigger && typeof mobileQuoteTrigger.focus === 'function') {
        mobileQuoteTrigger.focus();
    }
    mobileQuoteTrigger = null;
}

function getPendingQuoteStudent() {
    return currentState.students.find(student => student.id === pendingQuoteStudentId) || null;
}

function updateQuoteOptionsSummary() {
    if (!getPendingQuoteStudent()) return;

    const includeShipping = document.getElementById('mobileQuoteIncludeShipping');
    const quote = QuoteUtils.calculateQuote(
        currentState.currentCart,
        currentState.settings,
        includeShipping.checked && !includeShipping.disabled
    );

    document.getElementById('mobileQuoteItemsSubtotal').textContent = formatYen(quote.itemsSubtotal);
    document.getElementById('mobileQuoteGrandTotal').textContent = formatYen(quote.totalAmount);
}

function createQuotationFromOptions() {
    const student = getPendingQuoteStudent();
    if (!student || currentState.currentCart.length === 0) {
        closeQuoteOptions();
        return;
    }

    const includeShippingControl = document.getElementById('mobileQuoteIncludeShipping');
    const includeShipping = includeShippingControl.checked && !includeShippingControl.disabled;
    const restoreTarget = mobileQuoteTrigger;
    const modal = document.getElementById('mobileQuoteOptionsModal');
    modal.classList.remove('active');
    modal.hidden = true;
    pendingQuoteStudentId = null;
    const printed = printQuotation(student, includeShipping);
    if (!printed && restoreTarget && typeof restoreTarget.focus === 'function') {
        restoreTarget.focus();
    }
    mobileQuoteTrigger = null;
}

function createItemCard(item) {
    const div = document.createElement('div');
    div.className = 'item-card';
    div.onclick = () => openDetailModal(item);
    const isFav = currentState.favorites.includes(item.id);
    const favIcon = isFav ? '<i class="fa-solid fa-star" style="color:#fbbf24"></i>' : '';

    div.innerHTML = `
        <div class="item-main">
            <div class="item-title">${item.title}</div>
            <div class="item-meta">
                <span class="badge level-${item.level}">${getLevelLabel(item.level)}</span>
                <span class="badge subject-${item.subject}">${getSubjectLabel(item.subject)}</span>
                ${favIcon}
            </div>
            <div class="item-price">¥${(item.price_retail || 0).toLocaleString()}</div>
        </div>
        <div class="item-actions">
            <button class="btn-add" data-id="${item.id}">
                <i class="fa-solid fa-plus"></i>
            </button>
        </div>`;

    div.querySelector('.btn-add').addEventListener('click', (e) => {
        e.stopPropagation();
        quickAdd(item.id);
    });
    return div;
}

// Business Logic
async function quickAdd(itemId) {
    const item = enhancedData.find(i => i.id === itemId);
    if (!item) return;

    if (!currentState.currentStudentId) {
        alert('生徒を選択してください');
        openStudentModal();
        return;
    }

    const result = await addToCartDB(currentState.currentStudentId, item.id);
    if (!result) return;
    if (result.duplicate) { alert('既にカートに入っています'); return; }

    await reloadCartData();
    alert(`${item.title}\nをカートに追加しました`);
}

async function removeFromCartMobile(materialId) {
    await removeFromCartDB(currentState.currentStudentId, materialId);
    await reloadCartData();
    renderContent();
}

function updateCartBadge() {
    const badge = document.getElementById('cartBadge');
    const count = currentState.currentCart.length;
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function renderHeaderStudent() {
    const nameData = document.getElementById('currentStudentName');
    if (!currentState.currentStudentId) {
        nameData.textContent = '選択されていません';
        nameData.style.color = '#999';
    } else {
        const student = currentState.students.find(s => s.id === currentState.currentStudentId);
        if (student) {
            nameData.textContent = student.name + (student.grade ? ` (${student.grade})` : '');
            nameData.style.color = '#333';
        }
    }
}

// View Controllers
function openStudentModal() {
    const list = document.getElementById('studentList');
    list.innerHTML = '';
    currentState.students.forEach(student => {
        const div = document.createElement('div');
        div.className = `student-item ${student.id === currentState.currentStudentId ? 'active' : ''}`;
        div.innerHTML = `<span>${student.name} ${student.grade ? `(${student.grade})` : ''}</span>
            ${student.id === currentState.currentStudentId ? '<i class="fa-solid fa-check"></i>' : ''}`;
        div.onclick = async () => {
            currentState.currentStudentId = student.id;
            sessionStorage.setItem('currentStudentId', student.id);
            await reloadCartData();
            renderHeaderStudent();
            closeStudentModal();
            if (currentState.tab === 'cart') renderContent();
        };
        list.appendChild(div);
    });
    document.getElementById('studentModal').classList.add('active');
}

function closeStudentModal() {
    document.getElementById('studentModal').classList.remove('active');
}

function openDetailModal(item) {
    document.getElementById('detailTitle').textContent = item.title;
    document.getElementById('detailRetail').textContent = `¥${(item.price_retail || 0).toLocaleString()}`;
    document.getElementById('detailWholesale').textContent = `¥${(item.price_wholesale || 0).toLocaleString()}`;

    const favBtn = document.getElementById('detailFavBtn');
    const isFav = currentState.favorites.includes(item.id);
    favBtn.innerHTML = isFav ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
    favBtn.onclick = async () => {
        if (isFav) {
            currentState.favorites = currentState.favorites.filter(id => id !== item.id);
            await removeFavorite(item.id);
        } else {
            currentState.favorites.push(item.id);
            await addFavorite(item.id);
        }
        openDetailModal(item);
        if (currentState.tab === 'favorites') renderContent();
    };

    const addBtn = document.getElementById('detailAddCartBtn');
    addBtn.onclick = async () => {
        await quickAdd(item.id);
        document.getElementById('detailModal').classList.remove('active');
    };
    document.getElementById('detailModal').classList.add('active');
}

// Event Setup
function setupEventListeners() {
    // Bottom Nav
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab === 'menu') {
                document.getElementById('menuModal').classList.add('active');
            } else {
                document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentState.tab = tab;
                renderContent();
            }
        });
    });

    // Search
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    searchInput.addEventListener('input', (e) => {
        currentState.search = e.target.value;
        currentState.tab = 'home';
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-tab="home"]').classList.add('active');
        clearBtn.style.display = currentState.search ? 'block' : 'none';
        renderContent();
    });
    clearBtn.addEventListener('click', () => {
        currentState.search = '';
        searchInput.value = '';
        clearBtn.style.display = 'none';
        renderContent();
    });

    // Filters
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const filterType = chip.dataset.filter;
            const levels = ['all', 'elementary', 'junior', 'high'];
            const subjects = ['english', 'math', 'japanese', 'science', 'social'];

            if (levels.includes(filterType)) {
                levels.forEach(l => document.querySelector(`[data-filter="${l}"]`)?.classList.remove('active'));
                currentState.filterLevel = filterType;
            } else if (subjects.includes(filterType)) {
                subjects.forEach(s => document.querySelector(`[data-filter="${s}"]`)?.classList.remove('active'));
                currentState.filterSubject = filterType;
            } else if (filterType === 'all') {
                currentState.filterLevel = 'all';
                currentState.filterSubject = 'all';
                document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            }

            chip.classList.add('active');
            if (filterType === 'all') {
                document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
            }

            currentState.tab = 'home';
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            document.querySelector('[data-tab="home"]').classList.add('active');
            renderContent();
        });
    });

    // Modals
    document.getElementById('changeStudentBtn').addEventListener('click', openStudentModal);
    document.querySelectorAll('.close-sheet').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.sheet-overlay').forEach(s => s.classList.remove('active'));
    }));
    document.querySelectorAll('.close-detail').forEach(b => b.addEventListener('click', () => {
        document.getElementById('detailModal').classList.remove('active');
    }));

    // Student Creation
    document.getElementById('createNewStudentBtn').addEventListener('click', () => {
        document.getElementById('studentModal').classList.remove('active');
        document.getElementById('newStudentModal').classList.add('active');
    });
    document.getElementById('cancelNewStudentBtn').addEventListener('click', () => {
        document.getElementById('newStudentModal').classList.remove('active');
    });
    document.getElementById('saveNewStudentBtn').addEventListener('click', async () => {
        const name = document.getElementById('newStudentNameInput').value.trim();
        const grade = document.getElementById('newStudentGradeInput').value.trim();
        if (name) {
            const newStudent = await addStudent(name, grade);
            if (newStudent) {
                currentState.students.push(newStudent);
                currentState.currentStudentId = newStudent.id;
                sessionStorage.setItem('currentStudentId', newStudent.id);
                await reloadCartData();
                renderHeaderStudent();
                renderContent();
                updateCartBadge();
            }
            document.getElementById('newStudentModal').classList.remove('active');
        }
    });

    // Reset
    document.getElementById('menuReset').addEventListener('click', () => {
        if (confirm('全データを初期化しますか？')) {
            sessionStorage.clear();
            location.reload();
        }
    });

    // Settings
    document.getElementById('menuSettings').addEventListener('click', () => {
        mobileSettingsTrigger = document.querySelector('[data-tab="menu"]');
        document.getElementById('menuModal').classList.remove('active');
        openMobileSettings();
    });

    document.getElementById('cancelMobileSettingsBtn').addEventListener('click', closeMobileSettings);
    document.getElementById('saveMobileSettingsBtn').addEventListener('click', saveMobileSettings);

    const mobileSettingsModal = document.getElementById('mobileSettingsModal');
    mobileSettingsModal.addEventListener('click', (event) => {
        if (event.target === mobileSettingsModal) closeMobileSettings();
    });
    mobileSettingsModal.addEventListener('keydown', (event) => {
        handleModalKeyboard(event, mobileSettingsModal, closeMobileSettings);
    });

    document.getElementById('mobileQuoteIncludeShipping').addEventListener('change', updateQuoteOptionsSummary);
    document.getElementById('cancelMobileQuoteBtn').addEventListener('click', closeQuoteOptions);
    document.getElementById('confirmMobileQuoteBtn').addEventListener('click', createQuotationFromOptions);

    const mobileQuoteOptionsModal = document.getElementById('mobileQuoteOptionsModal');
    mobileQuoteOptionsModal.addEventListener('click', (event) => {
        if (event.target === mobileQuoteOptionsModal) closeQuoteOptions();
    });
    mobileQuoteOptionsModal.addEventListener('keydown', (event) => {
        handleModalKeyboard(event, mobileQuoteOptionsModal, closeQuoteOptions);
    });

    // History
    document.getElementById('menuHistory').addEventListener('click', async () => {
        const records = await getHistoryRecords(10);
        let msg = '履歴(最新10件):\n';
        if (records.length === 0) msg = '履歴はありません';
        else {
            records.forEach(h => {
                const d = new Date(h.created_at).toLocaleString('ja-JP');
                msg += `[${d}] ${h.type}: ${h.detail}\n`;
            });
        }
        alert(msg);
    });
}

function openMobileSettings() {
    document.getElementById('mobileSettingSchoolName').value = currentState.settings.schoolName ?? DEFAULT_SETTINGS.schoolName;
    document.getElementById('mobileSettingAddress').value = currentState.settings.address ?? DEFAULT_SETTINGS.address;
    document.getElementById('mobileSettingPhone').value = currentState.settings.phone ?? DEFAULT_SETTINGS.phone;
    document.getElementById('mobileSettingTaxRate').value = QuoteUtils.normalizeTaxRate(currentState.settings.taxRate);
    document.getElementById('mobileSettingShippingFee').value = QuoteUtils.normalizeShippingFee(currentState.settings.shippingFee);
    const modal = document.getElementById('mobileSettingsModal');
    modal.hidden = false;
    modal.classList.add('active');
    setTimeout(() => document.getElementById('mobileSettingSchoolName').focus(), 50);
}

function closeMobileSettings() {
    const modal = document.getElementById('mobileSettingsModal');
    modal.classList.remove('active');
    modal.hidden = true;
    if (mobileSettingsTrigger && typeof mobileSettingsTrigger.focus === 'function') {
        mobileSettingsTrigger.focus();
    }
    mobileSettingsTrigger = null;
}

async function saveMobileSettings() {
    const shippingFeeInput = document.getElementById('mobileSettingShippingFee');
    const taxRateInput = document.getElementById('mobileSettingTaxRate');
    const shippingFeeRaw = shippingFeeInput.value.trim();
    const taxRateRaw = taxRateInput.value.trim();
    const shippingFee = shippingFeeRaw === '' ? 0 : Number(shippingFeeRaw);
    const taxRate = Number(taxRateRaw);

    if (!Number.isSafeInteger(shippingFee) || shippingFee < 0) {
        alert('送料は0円以上の整数で入力してください');
        shippingFeeInput.focus();
        return;
    }

    if (taxRateRaw === '' || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) {
        alert('消費税率は0から1の小数で入力してください（例: 10%は0.10）');
        taxRateInput.focus();
        return;
    }

    const nextSettings = {
        schoolName: document.getElementById('mobileSettingSchoolName').value.trim(),
        address: document.getElementById('mobileSettingAddress').value.trim(),
        phone: document.getElementById('mobileSettingPhone').value.trim(),
        taxRate,
        shippingFee
    };
    const saveButton = document.getElementById('saveMobileSettingsBtn');
    saveButton.disabled = true;

    try {
        const results = await Promise.all([
            saveSetting('schoolName', nextSettings.schoolName),
            saveSetting('address', nextSettings.address),
            saveSetting('phone', nextSettings.phone),
            saveSetting('taxRate', nextSettings.taxRate),
            saveSetting('shippingFee', nextSettings.shippingFee)
        ]);

        if (results.some(result => result === false)) {
            alert('設定を保存できませんでした。通信状態を確認して、もう一度お試しください。');
            return;
        }

        currentState.settings = nextSettings;
        closeMobileSettings();
        alert('設定を保存しました');
    } catch (error) {
        console.error('[Mobile] Settings save error:', error);
        alert('設定を保存できませんでした。通信状態を確認して、もう一度お試しください。');
    } finally {
        saveButton.disabled = false;
    }
}

function handleModalKeyboard(event, modal, closeHandler) {
    if (event.key === 'Escape') {
        event.preventDefault();
        closeHandler();
        return;
    }

    if (event.key !== 'Tab') return;
    const focusable = Array.from(modal.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    ));
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

// Helpers
function getLevelLabel(l) { return { elementary: '小', junior: '中', high: '高', unknown: '他' }[l] || l; }
function getSubjectLabel(s) { return { english: '英', math: '数', japanese: '国', science: '理', social: '社', unknown: '他' }[s] || s; }

function printQuotation(student, includeShipping = false) {
    const today = new Date();
    const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;
    const quote = QuoteUtils.calculateQuote(currentState.currentCart, currentState.settings, includeShipping);

    const itemsHtml = currentState.currentCart.map((item, index) => {
        const price = QuoteUtils.normalizeYen(item.price_retail);
        return `<tr><td class="center">${index + 1}</td><td>${item.title}</td><td class="center">1</td><td class="right">¥${price.toLocaleString()}</td><td class="right">¥${price.toLocaleString()}</td></tr>`;
    }).join('');

    const shippingRowHtml = quote.shippingFee > 0 ? `
        <tr class="shipping-row">
            <td class="center">${currentState.currentCart.length + 1}</td>
            <td>送料</td>
            <td class="center">1</td>
            <td class="right">¥${quote.shippingFee.toLocaleString()}</td>
            <td class="right">¥${quote.shippingFee.toLocaleString()}</td>
        </tr>` : '';

    const ROW_TARGET = 10;
    const emptyRowsCount = Math.max(0, ROW_TARGET - quote.lineItemCount);
    let emptyRowsHtml = '';
    for (let i = 0; i < emptyRowsCount; i++) {
        emptyRowsHtml += '<tr><td class="center"></td><td></td><td class="center"></td><td class="right"></td><td class="right"></td></tr>';
    }

    const htmlContent = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>御見積書 - ${student.name}様</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;600&display=swap');
        body { font-family: 'Noto Serif JP', serif; margin: 0; padding: 0; background: #ccc; -webkit-print-color-adjust: exact; }
        .page { width: 210mm; min-height: 297mm; padding: 15mm; margin: 10mm auto; background: white; box-sizing: border-box; position: relative; }
        @media print { body { background: none; } .page { margin: 0; width: 100%; min-height: 297mm; height: auto; } @page { margin: 0; size: A4 portrait; } }
        .header { display: flex; justify-content: space-between; margin-bottom: 25px; }
        .title { font-size: 20pt; font-weight: 600; letter-spacing: 5px; border-bottom: 3px double #333; padding-bottom: 5px; }
        .date { text-align: right; font-size: 9pt; margin-bottom: 5px; }
        .info-block { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; }
        .recipient { font-size: 14pt; border-bottom: 1px solid #333; padding-bottom: 3px; min-width: 250px; }
        .recipient span { font-size: 10pt; }
        .sender { font-size: 9pt; line-height: 1.4; text-align: right; }
        .company-name { font-size: 11pt; font-weight: 600; margin-bottom: 3px; }
        .total-block { margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 5px; }
        .total-label { font-size: 11pt; margin-right: 15px; }
        .total-amount { font-size: 18pt; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10pt; }
        th { background-color: #f0f0f0; border: 1px solid #333; padding: 6px; font-weight: 600; text-align: center; }
        td { border: 1px solid #333; padding: 6px; height: 35px; }
        .shipping-row td { background-color: #fafafa; font-weight: 600; }
        .center { text-align: center; } .right { text-align: right; }
        .col-no { width: 30px; } .col-qty { width: 40px; } .col-unit { width: 80px; } .col-amount { width: 80px; }
        .remarks { border: 1px solid #333; padding: 8px; height: 80px; font-size: 9pt; }
        .remarks-title { font-size: 9pt; font-weight: 600; margin-bottom: 3px; text-decoration: underline; }
    </style></head><body>
    <div class="page">
        <div class="date">${dateStr}</div>
        <div class="header"><div class="title">御見積書</div></div>
        <div class="info-block">
            <div class="recipient">${student.name} <span>様</span></div>
            <div class="sender">
                <div class="company-name" style="font-size: 14pt;">${currentState.settings.schoolName}</div>
                ${currentState.settings.address ? `<div>${currentState.settings.address}</div>` : ''}
                ${currentState.settings.phone ? `<div>TEL: ${currentState.settings.phone}</div>` : ''}
            </div>
        </div>
        <div class="total-block">
            <span class="total-label">御見積金額</span>
            <span class="total-amount">¥${quote.totalAmount.toLocaleString()}-</span>
            <span style="font-size: 10pt;"> (税込)</span>
            <div style="font-size: 9pt; text-align: right; margin-top: 5px; color: #555;">
                (内消費税等 ${Math.round(quote.taxRate * 100)}%: ¥${quote.taxAmount.toLocaleString()})
            </div>
        </div>
        <table><thead><tr><th class="col-no">No.</th><th>品名</th><th class="col-qty">数量</th><th class="col-unit">単価</th><th class="col-amount">金額</th></tr></thead>
        <tbody>${itemsHtml}${shippingRowHtml}${emptyRowsHtml}</tbody></table>
        <div class="remarks"><div class="remarks-title">備考</div><p>有効期限: 本日より2週間<br>※本見積書はシステムによる自動発行です。</p></div>
    </div>
    <script>window.onload = function() { setTimeout(() => { window.print(); }, 500); };<\/script>
    </body></html>`;

    const win = window.open('', '_blank');
    if (!win) {
        alert('見積書を開けませんでした。ブラウザのポップアップを許可して、もう一度お試しください。');
        return false;
    }

    const shippingHistory = quote.shippingFee > 0
        ? `（送料 ¥${quote.shippingFee.toLocaleString()}を含む）`
        : '（送料なし）';
    void addHistoryRecord('見積書作成', `${student.name}様の見積書を作成しました${shippingHistory}`);
    win.document.write(htmlContent);
    win.document.close();
    return true;
}
