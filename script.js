// === Global Data ===
let enhancedData = [];

// Tag estimation from title (unchanged)
function estimateTagsFromTitle(title) {
    if (!title) return { level: 'unknown', subject: 'unknown', special: [] };
    let level = 'unknown';
    let subject = 'unknown';
    let special = [];
    const t = title.toLowerCase();

    if (t.includes('小') || t.includes('小学')) level = 'elementary';
    if (t.includes('中') || t.includes('中学') || t.includes('高校入試')) level = 'junior';
    if (t.includes('高') || t.includes('高校') || t.includes('大学入試') || t.includes('センター') || t.includes('共通テスト')) level = 'high';

    if (t.includes('英')) subject = 'english';
    if (t.includes('数') || t.includes('算')) subject = 'math';
    if (t.includes('国') || t.includes('文') || t.includes('漢字')) subject = 'japanese';
    if (t.includes('理') || t.includes('物') || t.includes('化') || t.includes('生')) subject = 'science';
    if (t.includes('社') || t.includes('史') || t.includes('地') || t.includes('公')) subject = 'social';

    if (t.includes('英検')) special.push('eiken');
    if (t.includes('受験') || t.includes('入試') || t.includes('共通テスト') || t.includes('センター') || t.includes('赤本') || t.includes('虎の巻')) special.push('exam');
    if (t.includes('春期') || t.includes('夏期') || t.includes('冬期') || t.includes('講習')) special.push('season');

    return { level, subject, special };
}

// === APP STATE ===
let currentState = {
    search: '',
    filterLevel: 'all',
    filterSubject: 'all',
    filterSpecial: 'all',
    sort: 'relevance',

    students: [],
    currentStudentId: null,
    currentCart: [],

    favorites: [],
    settings: {
        schoolName: 'ECCベストワン藍住・北島中央',
        taxRate: 0.10,
        address: '',
        phone: ''
    },
    viewMode: 'search',

    // Material editing
    editingMaterialId: null
};

// === DOM ELEMENTS ===
const grid = document.getElementById('materialsGrid');
const searchInput = document.getElementById('searchInput');
const resultsCount = document.querySelector('#resultsCount span');
const sortSelect = document.getElementById('sortSelect');
const modalOverlay = document.getElementById('detailModal');
const closeModal = document.querySelector('#detailModal .close-modal');

const studentSelect = document.getElementById('studentSelect');
const addStudentBtn = document.getElementById('addStudentBtn');
const studentModal = document.getElementById('studentModal');
const saveStudentBtn = document.getElementById('saveStudentBtn');
const newStudentName = document.getElementById('newStudentName');
const cartItemsList = document.getElementById('cartItemsList');
const cartEmptyState = document.getElementById('cartEmptyState');
const cartTotalWholesale = document.getElementById('cartTotalWholesale');
const cartTotalRetail = document.getElementById('cartTotalRetail');
const exportStudentListBtn = document.getElementById('exportStudentListBtn');
const exportOrderSheetBtn = document.getElementById('exportOrderSheetBtn');
const createQuoteBtn = document.getElementById('createQuoteBtn');
const newStudentGrade = document.getElementById('newStudentGrade');
const importStudentBtn = document.getElementById('importStudentBtn');
const importStudentInput = document.getElementById('importStudentInput');
const deleteAllStudentsBtn = document.getElementById('deleteAllStudentsBtn');
const deleteStudentBtn = document.getElementById('deleteStudentBtn');

const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileCartBtn = document.getElementById('mobileCartBtn');
const mobileCartBadge = document.getElementById('mobileCartBadge');
const drawerOverlay = document.getElementById('drawerOverlay');
const sidebar = document.querySelector('.sidebar');
const cartPanel = document.querySelector('.cart-panel');


// === INITIALIZATION ===
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Init Supabase
    initSupabase();

    // 2. Load all data from Supabase
    await loadAllData();

    // 3. Reset view for clean start
    currentState.search = '';
    currentState.filterLevel = 'all';
    currentState.filterSubject = 'all';
    currentState.filterSpecial = 'all';
    currentState.viewMode = 'search';

    // 4. Render Initial State
    if (searchInput) searchInput.value = '';
    renderStudentSelect();
    updateCartDisplay();
    renderGrid();

    if (exportStudentListBtn) exportStudentListBtn.disabled = false;
    if (exportOrderSheetBtn) exportOrderSheetBtn.disabled = false;

    // Mobile Event Listeners
    setupMobileListeners();

    // 5. Attach Event Listeners
    setupEventListeners();

    // 6. Force "Active" on all All-buttons
    ['levelFilters', 'subjectFilters', 'specialFilters'].forEach(id => {
        const container = document.getElementById(id);
        if (container) {
            container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            const allBtn = container.querySelector('[data-filter="all"]');
            if (allBtn) allBtn.classList.add('active');
        }
    });

    updateViewMode('search');

    // 7. Subscribe to realtime changes
    subscribeToChanges(
        // Materials changed
        () => { reloadMaterials(); },
        // Students changed
        () => { reloadStudents(); },
        // Cart changed
        () => { reloadCart(); }
    );
});

// === DATA LOADING (Supabase) ===

async function loadAllData() {
    try {
        // Load materials
        const materials = await loadMaterials();
        enhancedData = materials.map(item => ({ ...item, ...estimateTagsFromTitle(item.title) }));

        // Load students
        currentState.students = await loadStudents();

        // Restore selected student (from sessionStorage for tab persistence)
        const savedStudentId = sessionStorage.getItem('currentStudentId');
        if (savedStudentId && currentState.students.some(s => s.id === savedStudentId)) {
            currentState.currentStudentId = savedStudentId;
        } else if (currentState.students.length > 0) {
            currentState.currentStudentId = currentState.students[0].id;
        }

        // Load cart for current student
        if (currentState.currentStudentId) {
            currentState.currentCart = await getCart(currentState.currentStudentId);
        }

        // Load favorites
        currentState.favorites = await getFavorites();

        // Load settings
        const settings = await loadSettings();
        if (settings.schoolName) currentState.settings.schoolName = settings.schoolName;
        if (settings.taxRate !== undefined) currentState.settings.taxRate = settings.taxRate;
        if (settings.address) currentState.settings.address = settings.address;
        if (settings.phone) currentState.settings.phone = settings.phone;

    } catch (e) {
        console.error('[App] Failed to load data:', e);
        alert('データの読み込みに失敗しました。\nSupabaseの接続設定を確認してください。');
    }
}

async function reloadMaterials() {
    const materials = await loadMaterials();
    enhancedData = materials.map(item => ({ ...item, ...estimateTagsFromTitle(item.title) }));
    renderGrid();
}

async function reloadStudents() {
    currentState.students = await loadStudents();
    renderStudentSelect();
    // If current student was deleted
    if (currentState.currentStudentId && !currentState.students.some(s => s.id === currentState.currentStudentId)) {
        currentState.currentStudentId = currentState.students.length > 0 ? currentState.students[0].id : null;
        sessionStorage.setItem('currentStudentId', currentState.currentStudentId || '');
        await reloadCart();
    }
}

async function reloadCart() {
    if (currentState.currentStudentId) {
        currentState.currentCart = await getCart(currentState.currentStudentId);
    } else {
        currentState.currentCart = [];
    }
    updateCartDisplay();
}


// === EVENT LISTENERS SETUP ===

function setupMobileListeners() {
    if (mobileMenuBtn && sidebar && drawerOverlay) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            drawerOverlay.classList.toggle('active');
            if (cartPanel) cartPanel.classList.remove('active');
        });
    }
    if (mobileCartBtn && cartPanel && drawerOverlay) {
        mobileCartBtn.addEventListener('click', () => {
            cartPanel.classList.toggle('active');
            drawerOverlay.classList.toggle('active');
            if (sidebar) sidebar.classList.remove('active');
        });
    }
    if (drawerOverlay) {
        drawerOverlay.addEventListener('click', () => {
            if (sidebar) sidebar.classList.remove('active');
            if (cartPanel) cartPanel.classList.remove('active');
            drawerOverlay.classList.remove('active');
        });
    }
}

function setupEventListeners() {
    // Nav
    const navSearch = document.getElementById('navSearch');
    if (navSearch) navSearch.addEventListener('click', () => updateViewMode('search'));

    const navFavorites = document.getElementById('navFavorites');
    if (navFavorites) navFavorites.addEventListener('click', () => updateViewMode('favorites'));

    const navHistory = document.getElementById('navHistory');
    if (navHistory) navHistory.addEventListener('click', () => updateViewMode('history'));

    const navMaterials = document.getElementById('navMaterials');
    if (navMaterials) navMaterials.addEventListener('click', () => updateViewMode('materials'));

    const navSettings = document.getElementById('navSettings');
    if (navSettings) navSettings.addEventListener('click', openSettings);

    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettingsHandler);

    const btnDeleteAllStudents = document.getElementById('btnDeleteAllStudents');
    if (btnDeleteAllStudents) btnDeleteAllStudents.addEventListener('click', confirmDeleteAllStudents);

    const btnFactoryReset = document.getElementById('btnFactoryReset');
    if (btnFactoryReset) btnFactoryReset.addEventListener('click', confirmFactoryReset);

    if (deleteStudentBtn) deleteStudentBtn.addEventListener('click', confirmDeleteSingleStudent);

    // Confirm Modal
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) {
        const cancelBtn = document.getElementById('confirmCancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', () => confirmModal.classList.remove('active'));
        confirmModal.addEventListener('click', (e) => {
            if (e.target === confirmModal) confirmModal.classList.remove('active');
        });
    }

    // Settings Modal close
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.querySelectorAll('.close-modal, .close-modal-btn').forEach(btn => {
            btn.addEventListener('click', () => settingsModal.classList.remove('active'));
        });
    }

    // Filter Chips
    document.querySelectorAll('.chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const parentId = e.target.parentElement.id;
            const filterValue = e.target.dataset.filter;
            e.target.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            if (parentId === 'levelFilters') currentState.filterLevel = filterValue;
            if (parentId === 'subjectFilters') currentState.filterSubject = filterValue;
            if (parentId === 'specialFilters') currentState.filterSpecial = filterValue;
            renderGrid();
        });
    });

    // Search & Sort
    searchInput.addEventListener('input', (e) => { currentState.search = e.target.value.toLowerCase(); renderGrid(); });
    sortSelect.addEventListener('change', (e) => { currentState.sort = e.target.value; renderGrid(); });

    // Detail Modal
    if (closeModal) closeModal.addEventListener('click', () => modalOverlay.classList.remove('active'));
    if (studentModal) studentModal.querySelector('.close-modal').addEventListener('click', () => studentModal.classList.remove('active'));
    if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.remove('active'); });

    // Student Management
    if (addStudentBtn) addStudentBtn.addEventListener('click', () => {
        newStudentName.value = '';
        newStudentGrade.value = '';
        studentModal.classList.add('active');
        setTimeout(() => newStudentName.focus(), 100);
    });

    if (saveStudentBtn) saveStudentBtn.addEventListener('click', async () => {
        const name = newStudentName.value.trim();
        const grade = newStudentGrade.value.trim();
        if (!name) return;
        await addSingleStudentAsync(name, grade);
        studentModal.classList.remove('active');
    });

    if (studentSelect) studentSelect.addEventListener('change', async (e) => {
        currentState.currentStudentId = e.target.value || null;
        sessionStorage.setItem('currentStudentId', currentState.currentStudentId || '');
        await reloadCart();
    });

    // Import from Excel
    if (importStudentBtn) importStudentBtn.addEventListener('click', () => importStudentInput.click());
    if (importStudentInput) importStudentInput.addEventListener('change', handleExcelImport);

    // Delete All Carts
    if (deleteAllStudentsBtn) deleteAllStudentsBtn.addEventListener('click', async () => {
        if (currentState.students.length === 0) return;
        if (confirm('全ての生徒のカートを空にします。\n生徒データ自体は削除されません。\nよろしいですか？')) {
            await clearAllCarts();
            await reloadCart();
            alert('全てのカートを空にしました');
        }
    });

    // Material Modal
    const saveMaterialBtn = document.getElementById('saveMaterialBtn');
    if (saveMaterialBtn) saveMaterialBtn.addEventListener('click', saveMaterialHandler);

    // Export buttons
    if (createQuoteBtn) createQuoteBtn.addEventListener('click', handleCreateQuote);
    if (exportStudentListBtn) exportStudentListBtn.addEventListener('click', handleExportStudentList);
    if (exportOrderSheetBtn) exportOrderSheetBtn.addEventListener('click', handleExportOrderSheet);
}


// === VIEW MODE ===

function updateViewMode(mode) {
    currentState.viewMode = mode;
    const items = document.querySelectorAll('.nav-item');
    if (items) {
        items.forEach(el => el.classList.remove('active'));
        const activeId = 'nav' + mode.charAt(0).toUpperCase() + mode.slice(1);
        const activeEl = document.getElementById(activeId);
        if (activeEl) activeEl.classList.add('active');
    }
    renderGrid();
}


// === SETTINGS ===

function openSettings() {
    document.getElementById('settingSchoolName').value = currentState.settings.schoolName || '';
    document.getElementById('settingAddress').value = currentState.settings.address || '';
    document.getElementById('settingPhone').value = currentState.settings.phone || '';
    document.getElementById('settingTaxRate').value = currentState.settings.taxRate || 0.10;
    document.getElementById('settingsModal').classList.add('active');
}

async function saveSettingsHandler() {
    currentState.settings.schoolName = document.getElementById('settingSchoolName').value;
    currentState.settings.address = document.getElementById('settingAddress').value;
    currentState.settings.phone = document.getElementById('settingPhone').value;
    currentState.settings.taxRate = parseFloat(document.getElementById('settingTaxRate').value);

    await saveSetting('schoolName', currentState.settings.schoolName);
    await saveSetting('address', currentState.settings.address);
    await saveSetting('phone', currentState.settings.phone);
    await saveSetting('taxRate', currentState.settings.taxRate);

    document.getElementById('settingsModal').classList.remove('active');
    alert('設定を保存しました');
}


// === CONFIRM DIALOGS ===

function showConfirm(title, message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${title}`;
    document.getElementById('confirmMessage').innerText = message;
    const okBtn = document.getElementById('confirmOkBtn');
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    newOkBtn.addEventListener('click', () => { onConfirm(); modal.classList.remove('active'); });
    modal.classList.add('active');
    setTimeout(() => document.getElementById('confirmCancelBtn').focus(), 50);
}

function confirmDeleteAllStudents() {
    showConfirm('全生徒データ削除',
        '本当に全ての生徒データ（カート含む）を削除しますか？\nこの操作は取り消せません。',
        async () => {
            await deleteAllStudents();
            await clearHistory();
            currentState.currentStudentId = null;
            sessionStorage.removeItem('currentStudentId');
            await reloadStudents();
            await reloadCart();
            alert('全生徒データを削除しました');
        });
}

function confirmDeleteSingleStudent() {
    if (!currentState.currentStudentId) {
        alert('削除する生徒を選択してください');
        return;
    }
    const student = currentState.students.find(s => s.id === currentState.currentStudentId);
    if (!student) return;

    showConfirm('生徒データ削除',
        `${student.name} さんのデータを削除しますか？\nこの操作は取り消せません。`,
        async () => {
            await deleteStudent(currentState.currentStudentId);
            currentState.currentStudentId = null;
            sessionStorage.removeItem('currentStudentId');
            await reloadStudents();
            if (currentState.students.length > 0) {
                currentState.currentStudentId = currentState.students[currentState.students.length - 1].id;
                sessionStorage.setItem('currentStudentId', currentState.currentStudentId);
            }
            await reloadCart();
            alert('削除しました');
        });
}

function confirmFactoryReset() {
    showConfirm('完全初期化',
        'アプリケーションを完全に初期化します。\n全ての設定、お気に入り、履歴が削除されます。\n本当によろしいですか？',
        () => {
            sessionStorage.clear();
            location.reload();
        });
}


// === STUDENT MANAGEMENT ===

async function addSingleStudentAsync(name, grade) {
    const newStudent = await addStudent(name, grade);
    if (newStudent) {
        currentState.students.push(newStudent);
        currentState.currentStudentId = newStudent.id;
        sessionStorage.setItem('currentStudentId', newStudent.id);
        renderStudentSelect();
        await reloadCart();
    }
}

function renderStudentSelect() {
    studentSelect.innerHTML = '<option value="">生徒を選択...</option>';
    currentState.students.forEach(student => {
        const option = document.createElement('option');
        option.value = student.id;
        let label = student.name;
        if (student.grade) label += ` (${student.grade})`;
        option.textContent = label;
        if (student.id === currentState.currentStudentId) option.selected = true;
        studentSelect.appendChild(option);
    });
}

async function handleExcelImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (jsonData.length === 0) {
                alert('データが見つかりませんでした');
                return;
            }

            let nameIdx = 0, gradeIdx = 1, startRow = 0;
            const headerRow = jsonData[0];
            const isHeader = headerRow.some(cell => typeof cell === 'string' && (cell.includes('氏名') || cell.includes('名前')));
            if (isHeader) {
                startRow = 1;
                headerRow.forEach((cell, idx) => {
                    if (typeof cell !== 'string') return;
                    if (cell.includes('氏名') || cell.includes('名前')) nameIdx = idx;
                    if (cell.includes('学年')) gradeIdx = idx;
                });
            }

            let importCount = 0;
            for (let i = startRow; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || row.length === 0) continue;
                const name = (row[nameIdx] || '').toString().trim();
                const grade = (row[gradeIdx] || '').toString().trim();
                if (name) {
                    const result = await addStudent(name, grade);
                    if (result) importCount++;
                }
            }

            if (importCount > 0) {
                await reloadStudents();
                currentState.currentStudentId = currentState.students[currentState.students.length - 1].id;
                sessionStorage.setItem('currentStudentId', currentState.currentStudentId);
                renderStudentSelect();
                await reloadCart();
                alert(`${importCount}件の生徒データをインポートしました`);
            } else {
                alert('インポートできるデータがありませんでした');
            }
        } catch (error) {
            console.error(error);
            alert('ファイルの読み込みに失敗しました。\nExcelファイル形式を確認してください。');
        }
        importStudentInput.value = '';
    };
    reader.readAsArrayBuffer(file);
}


// === CART LOGIC (Supabase) ===

async function addToCartAsync(item) {
    if (!currentState.currentStudentId) {
        alert('先に生徒を選択してください');
        studentSelect.style.borderColor = 'red';
        setTimeout(() => studentSelect.style.borderColor = '', 1000);
        return;
    }

    const result = await addToCartDB(currentState.currentStudentId, item.id);
    if (!result) return;
    if (result.duplicate) {
        alert('この教材は既にカートに入っています');
        return;
    }

    await reloadCart();
    modalOverlay.classList.remove('active');
}

async function removeFromCartAsync(materialId) {
    if (!currentState.currentStudentId) return;
    await removeFromCartDB(currentState.currentStudentId, materialId);
    await reloadCart();
}

function updateCartDisplay() {
    cartItemsList.innerHTML = '';

    if (mobileCartBadge) {
        mobileCartBadge.style.display = 'none';
        mobileCartBadge.innerText = '0';
    }

    if (!currentState.currentStudentId) {
        cartEmptyState.style.display = 'flex';
        cartEmptyState.querySelector('p').innerHTML = '生徒を選択して<br>教材を追加してください';
        createQuoteBtn.disabled = true;
        updateTotals(0, 0);
        return;
    }

    if (currentState.currentCart.length === 0) {
        cartEmptyState.style.display = 'flex';
        cartEmptyState.querySelector('p').innerHTML = 'カートは空です';
        createQuoteBtn.disabled = true;
        updateTotals(0, 0);
        return;
    }

    if (mobileCartBadge) {
        mobileCartBadge.style.display = 'flex';
        mobileCartBadge.innerText = currentState.currentCart.length;
    }

    cartEmptyState.style.display = 'none';
    if (exportStudentListBtn) exportStudentListBtn.disabled = false;
    if (exportOrderSheetBtn) exportOrderSheetBtn.disabled = false;
    createQuoteBtn.disabled = false;

    let totalW = 0, totalR = 0;

    currentState.currentCart.forEach(item => {
        totalW += (parseInt(item.price_wholesale) || 0);
        totalR += (parseInt(item.price_retail) || 0);

        const el = document.createElement('div');
        el.className = 'cart-item';
        el.innerHTML = `
            <div class="cart-item-title">${item.title}</div>
            <div class="cart-item-actions">
                <div class="cart-item-price">¥${(parseInt(item.price_retail) || 0).toLocaleString()}</div>
            </div>
            <button class="item-delete-btn" onclick="return false;"><i class="fa-solid fa-trash"></i></button>
        `;
        el.querySelector('.item-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromCartAsync(item.id);
        });
        cartItemsList.appendChild(el);
    });

    updateTotals(totalW, totalR);
}

function updateTotals(wholesale, retail) {
    cartTotalWholesale.textContent = `¥${wholesale.toLocaleString()}`;
    cartTotalRetail.textContent = `¥${retail.toLocaleString()}`;
}


// === BADGE / LABEL HELPERS ===

function createBadge(context, type, category) {
    const span = document.createElement('span');
    let className = 'badge';
    let label = type;
    if (category === 'level') { className += ` level-${type}`; label = getLevelLabel(type); }
    else if (category === 'subject') { className += ` subject-${type}`; label = getSubjectLabel(type); }
    else if (category === 'special') { className += ` special-${type}`; label = getSpecialLabel(type); }
    span.className = className;
    span.textContent = label;
    return span;
}

function getLevelLabel(type) {
    return { 'elementary': '小学生', 'junior': '中学生', 'high': '高校生', 'unknown': 'その他' }[type] || type;
}
function getSubjectLabel(type) {
    return { 'english': '英語', 'math': '数学/算数', 'japanese': '国語', 'science': '理科', 'social': '社会', 'unknown': 'その他' }[type] || type;
}
function getSpecialLabel(type) {
    return { 'eiken': '英検', 'exam': '受験対策', 'season': '季節講習' }[type] || type;
}


// === RENDER GRID ===

function renderGrid() {
    grid.innerHTML = '';

    if (currentState.viewMode === 'history') {
        renderHistory();
        return;
    }

    if (currentState.viewMode === 'materials') {
        renderMaterialsManagement();
        return;
    }

    // Filter
    let filtered = enhancedData.filter(item => {
        if (currentState.viewMode === 'favorites') {
            if (!currentState.favorites.includes(item.id)) return false;
        }
        const searchKeywords = currentState.search.toLowerCase().split(/[\s\u3000]+/).filter(k => k);
        const matchSearch = searchKeywords.every(keyword => item.title.toLowerCase().includes(keyword));
        const matchLevel = currentState.filterLevel === 'all' || item.level === currentState.filterLevel;
        const matchSubject = currentState.filterSubject === 'all' || item.subject === currentState.filterSubject;
        let matchSpecial = true;
        if (currentState.filterSpecial !== 'all') {
            matchSpecial = item.special && item.special.includes(currentState.filterSpecial);
        }
        return matchSearch && matchLevel && matchSubject && matchSpecial;
    });

    // Sort
    if (currentState.sort === 'price-asc') filtered.sort((a, b) => a.price_retail - b.price_retail);
    else if (currentState.sort === 'price-desc') filtered.sort((a, b) => b.price_retail - a.price_retail);

    const countLabelBase = currentState.viewMode === 'favorites' ? 'お気に入り' : '検索結果';
    document.querySelector('#resultsCount').innerHTML = `${countLabelBase}: <span class="count-animate">${filtered.length}</span> 件`;

    filtered.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'material-card';
        if (index < 30) card.style.animationDelay = `${index * 0.03}s`;

        const levelLabel = getLevelLabel(item.level);
        const subjectLabel = getSubjectLabel(item.subject);
        let specialBadges = '';
        if (item.special) {
            item.special.forEach(sp => {
                specialBadges += `<span class="badge special-${sp}">${getSpecialLabel(sp)}</span>`;
            });
        }

        const isFav = currentState.favorites.includes(item.id);
        const starClass = isFav ? 'fa-solid' : 'fa-regular';
        const starColor = isFav ? '#fbbf24' : '#ccc';

        card.innerHTML = `
            <div class="card-badges">
                <span class="badge level-${item.level}">${levelLabel}</span>
                <span class="badge subject-${item.subject}">${subjectLabel}</span>
                ${specialBadges}
                <i class="${starClass} fa-star fav-btn" style="margin-left: auto; cursor: pointer; font-size: 1.2rem; color: ${starColor};" title="お気に入り"></i>
            </div>
            <div class="card-content">
                <h3>${item.title}</h3>
            </div>
            <div class="price-block">
                <div class="price-row wholesale">
                    <span class="price-label">仕入</span>
                    <span class="price-value">¥${(parseInt(item.price_wholesale) || 0).toLocaleString()}</span>
                </div>
                <div class="price-row retail">
                    <span class="price-label">販売</span>
                    <span class="price-value">¥${(parseInt(item.price_retail) || 0).toLocaleString()}</span>
                </div>
            </div>
            <button class="add-cart-btn">
                <i class="fa-solid fa-plus"></i> カートに追加
            </button>
        `;

        card.querySelector('.fav-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavoriteAsync(item.id);
        });
        card.querySelector('.add-cart-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            addToCartAsync(item);
        });

        grid.appendChild(card);
    });
}

async function toggleFavoriteAsync(itemId) {
    const idx = currentState.favorites.indexOf(itemId);
    if (idx > -1) {
        currentState.favorites.splice(idx, 1);
        await removeFavorite(itemId);
    } else {
        currentState.favorites.push(itemId);
        await addFavorite(itemId);
    }
    renderGrid();
}


// === MATERIALS MANAGEMENT VIEW ===

function renderMaterialsManagement() {
    document.querySelector('#resultsCount').innerHTML = `教材管理: <span class="count-animate">${enhancedData.length}</span> 件`;

    // Add header with "Add" button
    const header = document.createElement('div');
    header.style.cssText = 'grid-column: 1/-1; display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;';
    header.innerHTML = `
        <h3 style="font-size:1.1rem; color:#334155;">教材一覧 (クリックで編集)</h3>
        <button class="btn-primary" id="addMaterialBtnTop" style="font-size:0.9rem; padding:0.5rem 1rem;">
            <i class="fa-solid fa-plus"></i> 新規教材追加
        </button>
    `;
    grid.appendChild(header);
    header.querySelector('#addMaterialBtnTop').addEventListener('click', openAddMaterialModal);

    // Search filter for materials management
    let items = enhancedData;
    if (currentState.search) {
        const keywords = currentState.search.toLowerCase().split(/[\s\u3000]+/).filter(k => k);
        items = items.filter(item => keywords.every(k => item.title.toLowerCase().includes(k)));
    }

    // Render as a table-like list
    const table = document.createElement('div');
    table.style.cssText = 'grid-column: 1/-1; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;';

    items.forEach(item => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; padding:0.75rem 1rem; border-bottom:1px solid #f1f5f9; cursor:pointer; transition:background 0.15s;';
        row.onmouseover = () => row.style.background = '#f8fafc';
        row.onmouseout = () => row.style.background = '';
        row.innerHTML = `
            <div style="flex:1; min-width:0;">
                <div style="font-weight:500; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</div>
                <div style="font-size:0.8rem; color:#94a3b8; margin-top:2px;">ID: ${item.id}</div>
            </div>
            <div style="text-align:right; min-width:140px;">
                <div style="font-size:0.85rem; color:#3730a3;">仕入 ¥${(item.price_wholesale || 0).toLocaleString()}</div>
                <div style="font-size:0.95rem; font-weight:600; color:#166534;">販売 ¥${(item.price_retail || 0).toLocaleString()}</div>
            </div>
            <button class="delete-material-btn" style="margin-left:0.75rem; background:none; border:none; color:#cbd5e1; cursor:pointer; font-size:1rem; padding:0.25rem;" title="削除">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        row.addEventListener('click', (e) => {
            if (e.target.closest('.delete-material-btn')) return;
            openEditMaterialModal(item);
        });
        row.querySelector('.delete-material-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDeleteMaterial(item);
        });
        table.appendChild(row);
    });

    grid.appendChild(table);
}

function openAddMaterialModal() {
    currentState.editingMaterialId = null;
    document.getElementById('materialModalTitle').textContent = '新規教材登録';
    document.getElementById('materialId').value = '';
    document.getElementById('materialId').disabled = false;
    document.getElementById('materialTitle').value = '';
    document.getElementById('materialWholesale').value = '';
    document.getElementById('materialRetail').value = '';
    document.getElementById('materialModal').classList.add('active');
    setTimeout(() => document.getElementById('materialId').focus(), 100);
}

function openEditMaterialModal(item) {
    currentState.editingMaterialId = item.id;
    document.getElementById('materialModalTitle').textContent = '教材編集';
    document.getElementById('materialId').value = item.id;
    document.getElementById('materialId').disabled = true; // ID is not editable
    document.getElementById('materialTitle').value = item.title;
    document.getElementById('materialWholesale').value = item.price_wholesale || 0;
    document.getElementById('materialRetail').value = item.price_retail || 0;
    document.getElementById('materialModal').classList.add('active');
    setTimeout(() => document.getElementById('materialTitle').focus(), 100);
}

async function saveMaterialHandler() {
    const id = document.getElementById('materialId').value.trim();
    const title = document.getElementById('materialTitle').value.trim();
    const wholesale = parseInt(document.getElementById('materialWholesale').value) || 0;
    const retail = parseInt(document.getElementById('materialRetail').value) || 0;

    if (!id || !title) {
        alert('教材IDと教材名は必須です');
        return;
    }

    if (currentState.editingMaterialId) {
        // Update
        const result = await updateMaterial(currentState.editingMaterialId, {
            title, price_wholesale: wholesale, price_retail: retail
        });
        if (result) {
            await addHistoryRecord('教材編集', `${title} の情報を更新しました`);
            alert('教材を更新しました');
        }
    } else {
        // Check duplicate
        if (enhancedData.some(m => m.id === id)) {
            alert('このIDの教材は既に存在します');
            return;
        }
        const result = await addMaterial({ id, title, price_wholesale: wholesale, price_retail: retail });
        if (result) {
            await addHistoryRecord('教材追加', `${title} を新規追加しました`);
            alert('教材を追加しました');
        }
    }

    document.getElementById('materialModal').classList.remove('active');
    await reloadMaterials();
}

function confirmDeleteMaterial(item) {
    showConfirm('教材削除',
        `「${item.title}」を削除しますか？\nカートに入っている場合は自動的に削除されます。`,
        async () => {
            await deleteMaterial(item.id);
            await addHistoryRecord('教材削除', `${item.title} を削除しました`);
            await reloadMaterials();
            await reloadCart();
            alert('教材を削除しました');
        });
}


// === HISTORY ===

async function renderHistory() {
    const records = await getHistoryRecords(50);
    grid.innerHTML = '';
    document.querySelector('#resultsCount').innerHTML = `履歴: <span class="count-animate">${records.length}</span> 件`;

    if (records.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #666;">履歴はありません</div>';
        return;
    }

    const list = document.createElement('div');
    list.style.gridColumn = '1 / -1';
    list.style.background = 'white';
    list.style.padding = '1rem';
    list.style.borderRadius = '8px';

    records.forEach(h => {
        const dateStr = new Date(h.created_at).toLocaleString('ja-JP');
        const item = document.createElement('div');
        item.style.borderBottom = '1px solid #eee';
        item.style.padding = '0.5rem 0';
        item.innerHTML = `
            <div><strong>${dateStr}</strong> <span class="badge level-elementary">${h.type}</span></div>
            <div style="font-size: 0.9em; color: #555;">${h.detail}</div>
        `;
        list.appendChild(item);
    });
    grid.appendChild(list);
}


// === EXPORT / QUOTATION ===

async function handleCreateQuote() {
    if (!currentState.currentStudentId) return;
    const student = currentState.students.find(s => s.id === currentState.currentStudentId);
    if (!student || currentState.currentCart.length === 0) return;
    printQuotation(student, currentState.currentCart);
}

async function handleExportStudentList() {
    // Need to load all carts for all students
    const students = currentState.students;
    if (!students || students.length === 0) { alert('生徒データがありません'); return; }

    let allData = [];
    for (const student of students) {
        const cart = await getCart(student.id);
        cart.forEach(item => {
            allData.push({
                '氏名': student.name,
                '品名': item.title,
                '価格（税込）': parseInt(item.price_retail) || 0
            });
        });
    }

    if (allData.length === 0) { alert('出力対象のデータがありません（カートが空です）'); return; }

    const ws = XLSX.utils.json_to_sheet(allData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "全生徒リスト");
    const filename = `全生徒教材リスト_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    await addHistoryRecord('Excel出力', '全生徒教材リストを出力しました');
}

async function handleExportOrderSheet() {
    const students = currentState.students;
    if (!students || students.length === 0) { alert('生徒データがありません'); return; }

    const summary = {};
    for (const student of students) {
        const cart = await getCart(student.id);
        cart.forEach(item => {
            if (!summary[item.title]) summary[item.title] = { '品名': item.title, '数量': 0 };
            summary[item.title]['数量']++;
        });
    }

    const data = Object.values(summary);
    if (data.length === 0) { alert('出力対象のデータがありません（カートが空です）'); return; }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "発注用集計");
    const filename = `一括発注リスト_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    await addHistoryRecord('Excel出力', '発注用集計リストを出力しました');
}

function printQuotation(student, cartItems) {
    addHistoryRecord('見積書作成', `${student.name}様の見積書を作成しました`);
    const today = new Date();
    const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

    let totalAmount = 0;
    const itemsHtml = cartItems.map((item, index) => {
        const price = parseInt(item.price_retail) || 0;
        totalAmount += price;
        return `<tr><td class="center">${index + 1}</td><td>${item.title}</td><td class="center">1</td><td class="right">¥${price.toLocaleString()}</td><td class="right">¥${price.toLocaleString()}</td></tr>`;
    }).join('');

    const ROW_TARGET = 10;
    const emptyRowsCount = Math.max(0, ROW_TARGET - cartItems.length);
    let emptyRowsHtml = '';
    for (let i = 0; i < emptyRowsCount; i++) {
        emptyRowsHtml += '<tr><td class="center"></td><td></td><td class="center"></td><td class="right"></td><td class="right"></td></tr>';
    }

    const taxRate = currentState.settings.taxRate || 0.10;
    const taxAmount = Math.floor(totalAmount * taxRate / (1 + taxRate));

    const htmlContent = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>御見積書 - ${student.name}様</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;600&display=swap');
        body { font-family: 'Noto Serif JP', serif; margin: 0; padding: 0; background: #ccc; -webkit-print-color-adjust: exact; }
        .page { width: 210mm; height: 297mm; padding: 15mm; margin: 10mm auto; background: white; box-sizing: border-box; position: relative; overflow: hidden; }
        @media print { body { background: none; } .page { margin: 0; width: 100%; height: 100%; } @page { margin: 0; size: A4 portrait; } }
        .header { display: flex; justify-content: space-between; margin-bottom: 25px; }
        .title { font-size: 20pt; font-weight: 600; letter-spacing: 5px; border-bottom: 3px double #333; padding-bottom: 5px; display: inline-block; }
        .date { text-align: right; font-size: 9pt; margin-bottom: 5px; }
        .info-block { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; }
        .recipient { font-size: 14pt; border-bottom: 1px solid #333; padding-bottom: 3px; min-width: 250px; }
        .recipient span { font-size: 10pt; }
        .sender { font-size: 9pt; line-height: 1.4; text-align: right; }
        .company-name { font-size: 14pt; font-weight: 600; margin-bottom: 3px; }
        .total-block { margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 5px; }
        .total-label { font-size: 11pt; margin-right: 15px; }
        .total-amount { font-size: 18pt; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10pt; }
        th { background-color: #f0f0f0; border: 1px solid #333; padding: 6px; font-weight: 600; text-align: center; }
        td { border: 1px solid #333; padding: 6px; height: 35px; }
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
                <div class="company-name">${currentState.settings.schoolName}</div>
                ${currentState.settings.address ? `<div>${currentState.settings.address}</div>` : ''}
                ${currentState.settings.phone ? `<div>TEL: ${currentState.settings.phone}</div>` : ''}
            </div>
        </div>
        <div class="total-block">
            <span class="total-label">御見積金額</span>
            <span class="total-amount">¥${totalAmount.toLocaleString()}-</span>
            <span style="font-size: 10pt;"> (税込)</span>
            <div style="font-size: 9pt; text-align: right; margin-top: 5px; color: #555;">
                (内消費税等 ${Math.round(taxRate * 100)}%: ¥${taxAmount.toLocaleString()})
            </div>
        </div>
        <table><thead><tr><th class="col-no">No.</th><th>品名</th><th class="col-qty">数量</th><th class="col-unit">単価</th><th class="col-amount">金額</th></tr></thead>
        <tbody>${itemsHtml}${emptyRowsHtml}</tbody></table>
        <div class="remarks"><div class="remarks-title">備考</div><p>有効期限: 本日より2週間<br>※本見積書はシステムによる自動発行です。</p></div>
    </div>
    <script>window.onload = function() { setTimeout(() => { window.print(); }, 500); };<\/script>
    </body></html>`;

    const win = window.open('', '_blank');
    win.document.write(htmlContent);
    win.document.close();
}
