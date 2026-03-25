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
        phone: '',
        regNum: '',
        bankDetails: '',
        useHandlingFee: false,
        handlingFeeAmount: 0,
        paymentMethod: 'bank',
        paymentDeadline: ''
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

    // 6. Dark Mode
    initDarkMode();
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
        if (settings.regNum) currentState.settings.regNum = settings.regNum;
        if (settings.bankDetails) currentState.settings.bankDetails = settings.bankDetails;
        if (settings.useHandlingFee !== undefined) currentState.settings.useHandlingFee = settings.useHandlingFee;
        if (settings.handlingFeeAmount !== undefined) currentState.settings.handlingFeeAmount = settings.handlingFeeAmount;
        if (settings.paymentMethod) currentState.settings.paymentMethod = settings.paymentMethod;
        if (settings.paymentDeadline) currentState.settings.paymentDeadline = settings.paymentDeadline;

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

    const navHelp = document.getElementById('navHelp');
    if (navHelp) navHelp.addEventListener('click', () => updateViewMode('help'));

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

    // Student Template Download
    const dlStudentTemplateBtn = document.getElementById('dlStudentTemplateBtn');
    if (dlStudentTemplateBtn) dlStudentTemplateBtn.addEventListener('click', downloadStudentTemplate);

    // Material Import from Excel
    const importMaterialInput = document.getElementById('importMaterialInput');
    if (importMaterialInput) importMaterialInput.addEventListener('change', handleMaterialExcelImport);

    // Edit Student
    const editStudentBtn = document.getElementById('editStudentBtn');
    if (editStudentBtn) editStudentBtn.addEventListener('click', openEditStudentModal);
    const saveEditStudentBtn = document.getElementById('saveEditStudentBtn');
    if (saveEditStudentBtn) saveEditStudentBtn.addEventListener('click', saveEditStudent);
    const editStudentModal = document.getElementById('editStudentModal');
    if (editStudentModal) {
        editStudentModal.querySelector('.close-modal').addEventListener('click', () => editStudentModal.classList.remove('active'));
        editStudentModal.addEventListener('click', (e) => { if (e.target === editStudentModal) editStudentModal.classList.remove('active'); });
    }
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

    // Cart copy & order save
    const copyCartBtn = document.getElementById('copyCartBtn');
    if (copyCartBtn) copyCartBtn.addEventListener('click', copyCartToStudent);
    const saveOrderBtn = document.getElementById('saveOrderBtn');
    if (saveOrderBtn) saveOrderBtn.addEventListener('click', saveOrderHistory);

    // Settings: Logo handling
    const settingLogoInput = document.getElementById('settingLogoInput');
    const settingLogoPreview = document.getElementById('settingLogoPreview');
    const settingDeleteLogoBtn = document.getElementById('settingDeleteLogoBtn');

    if (settingLogoInput) {
        // Restore logo on load
        const savedLogo = localStorage.getItem('invoiceLogo');
        if (savedLogo && settingLogoPreview) {
            settingLogoPreview.src = savedLogo;
            settingLogoPreview.style.display = 'block';
            if (settingDeleteLogoBtn) settingDeleteLogoBtn.style.display = 'inline-block';
        }
        settingLogoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 1024 * 1024) { alert('画像サイズが大きすぎます（1MB以下推奨）。'); return; }
            const reader = new FileReader();
            reader.onload = function (evt) {
                localStorage.setItem('invoiceLogo', evt.target.result);
                if (settingLogoPreview) { settingLogoPreview.src = evt.target.result; settingLogoPreview.style.display = 'block'; }
                if (settingDeleteLogoBtn) settingDeleteLogoBtn.style.display = 'inline-block';
            };
            reader.readAsDataURL(file);
        });
    }
    if (settingDeleteLogoBtn) {
        settingDeleteLogoBtn.addEventListener('click', () => {
            localStorage.removeItem('invoiceLogo');
            if (settingLogoPreview) { settingLogoPreview.src = ''; settingLogoPreview.style.display = 'none'; }
            settingDeleteLogoBtn.style.display = 'none';
            if (settingLogoInput) settingLogoInput.value = '';
        });
    }

    // Settings: Handling fee toggle
    const settingUseFee = document.getElementById('settingUseHandlingFee');
    const settingFeeGroup = document.getElementById('settingFeeAmountGroup');
    if (settingUseFee && settingFeeGroup) {
        settingUseFee.addEventListener('change', () => {
            settingFeeGroup.style.display = settingUseFee.checked ? 'block' : 'none';
        });
    }

    // Settings: Payment method toggle
    const settingPaymentRadios = document.getElementsByName('settingPaymentMethod');
    const settingBankDetailsGroup = document.getElementById('settingBankDetailsGroup');
    const settingDeadlineLabel = document.getElementById('settingDeadlineLabel');
    for (const radio of settingPaymentRadios) {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'bank') {
                if (settingBankDetailsGroup) settingBankDetailsGroup.style.display = 'block';
                if (settingDeadlineLabel) settingDeadlineLabel.textContent = '振込期限';
            } else {
                if (settingBankDetailsGroup) settingBankDetailsGroup.style.display = 'none';
                if (settingDeadlineLabel) settingDeadlineLabel.textContent = '引き落とし日';
            }
        });
    }
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

    const filters = document.getElementById('filtersSection');
    const sortDropdown = document.querySelector('.sort-dropdown');

    if (mode === 'history' || mode === 'settings' || mode === 'materials' || mode === 'help') {
        if (filters) filters.style.display = 'none';
        if (sortDropdown) sortDropdown.style.display = 'none';
        document.querySelector('.search-container').style.display = 'none';
    } else {
        if (filters && !currentState.search) filters.style.display = 'block';
        if (sortDropdown) sortDropdown.style.display = 'block';
        document.querySelector('.search-container').style.display = 'flex';
    }

    renderGrid();
}


// === SETTINGS ===

function openSettings() {
    document.getElementById('settingSchoolName').value = currentState.settings.schoolName || '';
    document.getElementById('settingAddress').value = currentState.settings.address || '';
    document.getElementById('settingPhone').value = currentState.settings.phone || '';
    document.getElementById('settingTaxRate').value = currentState.settings.taxRate || 0.10;
    document.getElementById('settingRegNum').value = currentState.settings.regNum || '';
    document.getElementById('settingBankDetails').value = currentState.settings.bankDetails || '';
    document.getElementById('settingHandlingFeeAmount').value = currentState.settings.handlingFeeAmount || 0;
    document.getElementById('settingPaymentDeadline').value = currentState.settings.paymentDeadline || '';

    const useFee = document.getElementById('settingUseHandlingFee');
    const feeGroup = document.getElementById('settingFeeAmountGroup');
    useFee.checked = currentState.settings.useHandlingFee || false;
    feeGroup.style.display = useFee.checked ? 'block' : 'none';

    // Restore payment method radio
    const method = currentState.settings.paymentMethod || 'bank';
    const radios = document.getElementsByName('settingPaymentMethod');
    for (const r of radios) { r.checked = (r.value === method); }
    const bankDetailsGroup = document.getElementById('settingBankDetailsGroup');
    const deadlineLabel = document.getElementById('settingDeadlineLabel');
    if (method === 'bank') {
        if (bankDetailsGroup) bankDetailsGroup.style.display = 'block';
        if (deadlineLabel) deadlineLabel.textContent = '振込期限';
    } else {
        if (bankDetailsGroup) bankDetailsGroup.style.display = 'none';
        if (deadlineLabel) deadlineLabel.textContent = '引き落とし日';
    }

    document.getElementById('settingsModal').classList.add('active');
}

async function saveSettingsHandler() {
    currentState.settings.schoolName = document.getElementById('settingSchoolName').value;
    currentState.settings.address = document.getElementById('settingAddress').value;
    currentState.settings.phone = document.getElementById('settingPhone').value;
    currentState.settings.taxRate = parseFloat(document.getElementById('settingTaxRate').value);
    currentState.settings.regNum = document.getElementById('settingRegNum').value;
    currentState.settings.bankDetails = document.getElementById('settingBankDetails').value;
    currentState.settings.handlingFeeAmount = parseInt(document.getElementById('settingHandlingFeeAmount').value) || 0;
    currentState.settings.useHandlingFee = document.getElementById('settingUseHandlingFee').checked;
    currentState.settings.paymentDeadline = document.getElementById('settingPaymentDeadline').value;
    const selectedMethod = document.querySelector('input[name="settingPaymentMethod"]:checked');
    currentState.settings.paymentMethod = selectedMethod ? selectedMethod.value : 'bank';

    await saveSetting('schoolName', currentState.settings.schoolName);
    await saveSetting('address', currentState.settings.address);
    await saveSetting('phone', currentState.settings.phone);
    await saveSetting('taxRate', currentState.settings.taxRate);
    await saveSetting('regNum', currentState.settings.regNum);
    await saveSetting('bankDetails', currentState.settings.bankDetails);
    await saveSetting('useHandlingFee', currentState.settings.useHandlingFee);
    await saveSetting('handlingFeeAmount', currentState.settings.handlingFeeAmount);
    await saveSetting('paymentMethod', currentState.settings.paymentMethod);
    await saveSetting('paymentDeadline', currentState.settings.paymentDeadline);

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

function openEditStudentModal() {
    if (!currentState.currentStudentId) {
        alert('編集する生徒を選択してください');
        return;
    }
    const student = currentState.students.find(s => s.id === currentState.currentStudentId);
    if (!student) return;

    document.getElementById('editStudentName').value = student.name || '';
    document.getElementById('editStudentGrade').value = student.grade || '';
    document.getElementById('editStudentModal').classList.add('active');
    setTimeout(() => document.getElementById('editStudentName').focus(), 100);
}

async function saveEditStudent() {
    const name = document.getElementById('editStudentName').value.trim();
    const grade = document.getElementById('editStudentGrade').value.trim();

    if (!name) {
        alert('氏名は必須です');
        return;
    }

    const result = await updateStudent(currentState.currentStudentId, { name, grade });
    if (result) {
        // Update local state
        const idx = currentState.students.findIndex(s => s.id === currentState.currentStudentId);
        if (idx >= 0) {
            currentState.students[idx].name = name;
            currentState.students[idx].grade = grade;
        }
        renderStudentSelect();
        await addHistoryRecord('生徒編集', `${name} (${grade}) の情報を更新しました`);
        alert('生徒情報を更新しました');
    } else {
        alert('更新に失敗しました');
    }

    document.getElementById('editStudentModal').classList.remove('active');
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


// === TEMPLATE DOWNLOADS & MATERIAL BULK IMPORT ===

function downloadStudentTemplate() {
    const sampleData = [
        { '氏名': '山田太郎', '学年': '中2' },
        { '氏名': '佐藤花子', '学年': '高3' },
        { '氏名': '田中一郎', '学年': '小5' }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    ws['!cols'] = [{ wch: 20 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '生徒リスト');
    XLSX.writeFile(wb, '生徒登録サンプル.xlsx');
}

function downloadMaterialTemplate() {
    const sampleData = [
        { '教材ID': '111-123456-11', '教材名': '標準新演習 中1 英語', '仕入価格': 1200, '販売価格': 1800 },
        { '教材ID': '222-654321-22', '教材名': 'フォレスタ 中2 数学', '仕入価格': 1500, '販売価格': 2200 },
        { '教材ID': '333-111111-33', '教材名': '英検3級 過去問', '仕入価格': 900, '販売価格': 1400 }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    ws['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '教材リスト');
    XLSX.writeFile(wb, '教材登録サンプル.xlsx');
}

async function handleMaterialExcelImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(ev) {
        try {
            const data = new Uint8Array(ev.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const ws = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 });

            if (jsonData.length < 2) {
                alert('データが見つかりませんでした');
                return;
            }

            const header = jsonData[0];
            let idIdx = -1, titleIdx = -1, wholesaleIdx = -1, retailIdx = -1;
            header.forEach((cell, idx) => {
                const c = (cell || '').toString();
                if (c.includes('ID') || c.includes('id') || c.includes('教材ID')) idIdx = idx;
                if (c.includes('教材名') || c.includes('品名') || c.includes('タイトル')) titleIdx = idx;
                if (c.includes('仕入')) wholesaleIdx = idx;
                if (c.includes('販売') || c.includes('価格')) retailIdx = idx;
            });

            if (titleIdx === -1) {
                alert('「教材名」列が見つかりません。\nサンプルファイルの書式を参考にしてください。');
                return;
            }

            let addCount = 0, skipCount = 0;
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || row.length === 0) continue;

                const title = (row[titleIdx] || '').toString().trim();
                if (!title) continue;

                const id = idIdx >= 0 && row[idIdx]
                    ? row[idIdx].toString().trim()
                    : 'M-' + Date.now() + '-' + i;

                const wholesale = wholesaleIdx >= 0 ? (parseInt(row[wholesaleIdx]) || 0) : 0;
                const retail = retailIdx >= 0 ? (parseInt(row[retailIdx]) || 0) : 0;

                if (enhancedData.some(m => m.id === id)) {
                    skipCount++;
                    continue;
                }

                const result = await addMaterial({ id, title, price_wholesale: wholesale, price_retail: retail });
                if (result) addCount++;
            }

            await reloadMaterials();
            let msg = `${addCount}件の教材をインポートしました`;
            if (skipCount > 0) msg += `\n(重複スキップ: ${skipCount}件)`;
            await addHistoryRecord('Excelインポート', `教材を${addCount}件インポートしました`);
            alert(msg);

        } catch (error) {
            console.error(error);
            alert('ファイルの読み込みに失敗しました。\nExcelファイル形式を確認してください。');
        }
        e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

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
        const _copyBtn1 = document.getElementById('copyCartBtn'); if (_copyBtn1) _copyBtn1.disabled = true;
        const _saveBtn1 = document.getElementById('saveOrderBtn'); if (_saveBtn1) _saveBtn1.disabled = true;
        updateTotals(0, 0);
        return;
    }

    if (currentState.currentCart.length === 0) {
        cartEmptyState.style.display = 'flex';
        cartEmptyState.querySelector('p').innerHTML = 'カートは空です';
        createQuoteBtn.disabled = true;
        const _copyBtn2 = document.getElementById('copyCartBtn'); if (_copyBtn2) _copyBtn2.disabled = true;
        const _saveBtn2 = document.getElementById('saveOrderBtn'); if (_saveBtn2) _saveBtn2.disabled = true;
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
    const _copyBtn3 = document.getElementById('copyCartBtn'); if (_copyBtn3) _copyBtn3.disabled = false;
    const _saveBtn3 = document.getElementById('saveOrderBtn'); if (_saveBtn3) _saveBtn3.disabled = false;

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

    if (currentState.viewMode === 'help') {
        renderHelp();
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

    // Add header with action buttons
    const header = document.createElement('div');
    header.style.cssText = 'grid-column: 1/-1; display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:0.5rem;';
    header.innerHTML = `
        <h3 style="font-size:1.1rem; color:var(--text-primary, #334155);">教材一覧 (クリックで編集)</h3>
        <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
            <button class="btn-secondary" id="exportMaterialsBtn" style="font-size:0.85rem; padding:0.4rem 0.75rem;">
                <i class="fa-solid fa-file-excel"></i> 全教材Excel出力
            </button>
            <button class="btn-secondary" id="dlMaterialTemplateBtn" style="font-size:0.85rem; padding:0.4rem 0.75rem;">
                <i class="fa-solid fa-download"></i> サンプルDL
            </button>
            <button class="btn-secondary" id="importMaterialBtnTop" style="font-size:0.85rem; padding:0.4rem 0.75rem;">
                <i class="fa-solid fa-file-import"></i> Excel一括登録
            </button>
            <button class="btn-primary" id="addMaterialBtnTop" style="font-size:0.85rem; padding:0.4rem 0.75rem;">
                <i class="fa-solid fa-plus"></i> 新規追加
            </button>
        </div>
    `;
    grid.appendChild(header);
    header.querySelector('#addMaterialBtnTop').addEventListener('click', openAddMaterialModal);
    header.querySelector('#dlMaterialTemplateBtn').addEventListener('click', downloadMaterialTemplate);
    header.querySelector('#importMaterialBtnTop').addEventListener('click', () => document.getElementById('importMaterialInput').click());
    header.querySelector('#exportMaterialsBtn').addEventListener('click', handleExportAllMaterials);

    // Batch actions bar
    const batchBar = document.createElement('div');
    batchBar.id = 'materialBatchBar';
    batchBar.style.cssText = 'grid-column:1/-1; display:none; align-items:center; gap:1rem; padding:0.75rem 1rem; background:var(--danger-bg, #fef2f2); border:1px solid var(--danger-border, #fecaca); border-radius:8px; margin-bottom:0.5rem;';
    batchBar.innerHTML = `
        <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer;">
            <input type="checkbox" id="selectAllMaterials"> <span>全選択</span>
        </label>
        <span id="selectedCount" style="font-size:0.9rem; color:#666;">0件選択中</span>
        <button class="btn-secondary" id="batchDeleteBtn" style="font-size:0.85rem; padding:0.4rem 0.75rem; background:#fee2e2; color:#ef4444; border-color:#fecaca;">
            <i class="fa-solid fa-trash"></i> 選択を一括削除
        </button>
    `;
    grid.appendChild(batchBar);

    const selectAllCb = batchBar.querySelector('#selectAllMaterials');
    selectAllCb.addEventListener('change', (e) => {
        document.querySelectorAll('.material-checkbox').forEach(cb => { cb.checked = e.target.checked; });
        updateBatchCount();
    });
    batchBar.querySelector('#batchDeleteBtn').addEventListener('click', handleBatchDelete);

    // Search filter for materials management
    let items = enhancedData;
    if (currentState.search) {
        const keywords = currentState.search.toLowerCase().split(/[\s\u3000]+/).filter(k => k);
        items = items.filter(item => keywords.every(k => item.title.toLowerCase().includes(k)));
    }

    // Render as a table-like list
    const table = document.createElement('div');
    table.style.cssText = 'grid-column: 1/-1; background: var(--card-bg, white); border-radius: 12px; overflow: hidden; border: 1px solid var(--border-color, #e2e8f0);';

    items.forEach(item => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; padding:0.75rem 1rem; border-bottom:1px solid var(--border-color, #f1f5f9); cursor:pointer; transition:background 0.15s;';
        row.onmouseover = () => row.style.background = 'var(--hover-bg, #f8fafc)';
        row.onmouseout = () => row.style.background = '';
        row.innerHTML = `
            <input type="checkbox" class="material-checkbox" data-id="${item.id}" style="margin-right:0.75rem; width:18px; height:18px; cursor:pointer;" onclick="event.stopPropagation()">
            <div style="flex:1; min-width:0;">
                <div style="font-weight:500; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</div>
                <div style="font-size:0.8rem; color:var(--text-muted, #94a3b8); margin-top:2px;">ID: ${item.id}</div>
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
            if (e.target.closest('.delete-material-btn') || e.target.closest('.material-checkbox')) return;
            openEditMaterialModal(item);
        });
        row.querySelector('.delete-material-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDeleteMaterial(item);
        });
        row.querySelector('.material-checkbox').addEventListener('change', () => {
            updateBatchCount();
        });
        table.appendChild(row);
    });

    grid.appendChild(table);

    // Show batch bar if any checkbox interactions
    document.querySelectorAll('.material-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const bar = document.getElementById('materialBatchBar');
            bar.style.display = 'flex';
        });
    });
}

function updateBatchCount() {
    const checked = document.querySelectorAll('.material-checkbox:checked');
    const countEl = document.getElementById('selectedCount');
    if (countEl) countEl.textContent = `${checked.length}件選択中`;
    const bar = document.getElementById('materialBatchBar');
    if (bar) bar.style.display = checked.length > 0 ? 'flex' : 'none';
}

async function handleBatchDelete() {
    const checked = document.querySelectorAll('.material-checkbox:checked');
    if (checked.length === 0) return;
    if (!confirm(`${checked.length}件の教材を一括削除しますか？\nこの操作は元に戻せません。`)) return;

    let count = 0;
    for (const cb of checked) {
        await deleteMaterial(cb.dataset.id);
        count++;
    }
    await addHistoryRecord('一括削除', `${count}件の教材を一括削除しました`);
    await reloadMaterials();
    await reloadCart();
    alert(`${count}件の教材を削除しました`);
}

async function handleExportAllMaterials() {
    if (enhancedData.length === 0) { alert('教材データがありません'); return; }

    const data = enhancedData.map(item => ({
        '教材ID': item.id,
        '教材名': item.title,
        '仕入価格': item.price_wholesale || 0,
        '販売価格': item.price_retail || 0
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [{ wch: 18 }, { wch: 35 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '教材一覧');
    const filename = `教材一覧_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    await addHistoryRecord('Excel出力', `教材一覧(${data.length}件)をExcel出力しました`);
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


// === HELP MANUAL ===

function renderHelp() {
    document.querySelector('#resultsCount').innerHTML = `使い方ガイド`;
    grid.innerHTML = '';

    const content = document.createElement('div');
    content.style.cssText = 'grid-column: 1/-1; background: var(--surface, white); border-radius: 12px; padding: 2rem; border: 1px solid var(--border, #e2e8f0); color: var(--text-main, #1e293b); font-size: 0.95rem; line-height: 1.6;';

    content.innerHTML = `
        <h2 style="font-size: 1.5rem; color: var(--primary-color, #4f46e5); margin-bottom: 1.5rem; border-bottom: 2px solid var(--primary-color, #4f46e5); padding-bottom: 0.5rem;">
            <i class="fa-solid fa-circle-question"></i> CataBooks 取扱説明書
        </h2>

        <div style="margin-bottom: 2rem;">
            <h3 style="font-size: 1.1rem; border-left: 4px solid var(--accent-blue, #3b82f6); padding-left: 0.75rem; margin-bottom: 1rem;">1. 基本的な使い方（見積書作成）</h3>
            <ol style="margin-left: 1.5rem; margin-bottom: 1rem;">
                <li style="margin-bottom: 0.5rem;">右側のパネルの<b>「対象生徒」</b>ドロップダウンから生徒を選択します。</li>
                <li style="margin-bottom: 0.5rem;">画面中央の教材リストから、必要な教材の<b>「カートに追加」</b>ボタンをクリックします。（上部の検索ボックスや絞り込みボタンで探せます）</li>
                <li style="margin-bottom: 0.5rem;">右側のカートに教材が追加されます。</li>
                <li style="margin-bottom: 0.5rem;">最後に右下にある<b>「見積書作成」</b>ボタンを押すと、印刷用の見積書画面が開きます。</li>
            </ol>
            <div style="background: var(--wholesale-bg, #e0e7ff); padding: 0.75rem; border-radius: 6px; font-size: 0.9rem;">
                <i class="fa-solid fa-lightbulb" style="color: var(--accent-orange, #f59e0b);"></i> <b>Tip:</b> 「注文保存」ボタンを押すと、その生徒の注文履歴が記録されます。
            </div>
        </div>

        <div style="margin-bottom: 2rem;">
            <h3 style="font-size: 1.1rem; border-left: 4px solid var(--accent-green, #10b981); padding-left: 0.75rem; margin-bottom: 1rem;">2. 教材・生徒の登録（Excel一括登録）</h3>
            <ul style="margin-left: 1.5rem; margin-bottom: 1rem;">
                <li style="margin-bottom: 0.5rem;"><b>教材の登録</b>：左メニューの「教材管理」を開き、「サンプルDL」でExcel形式をダウンロード。記入後、「Excel一括登録」からアップロードします。</li>
                <li style="margin-bottom: 0.5rem;"><b>生徒の登録</b>：右パネル対象生徒の横にある「📥 アイコン（一括登録）」から同様にExcelで一括登録できます。</li>
            </ul>
        </div>

        <div style="margin-bottom: 2rem;">
            <h3 style="font-size: 1.1rem; border-left: 4px solid var(--accent-orange, #f59e0b); padding-left: 0.75rem; margin-bottom: 1rem;">3. 全体発注用リストの作成</h3>
            <p style="margin-bottom: 0.5rem;">全生徒のカートに教材を入れ終わったら、右下のボタンを活用します。</p>
            <ul style="margin-left: 1.5rem; margin-bottom: 1rem;">
                <li style="margin-bottom: 0.5rem;"><b>「全生徒リスト」</b>：どの生徒にどの教材を渡すかの一覧表（Excel）がダウンロードされます。配布時のチェックに使えます。</li>
                <li style="margin-bottom: 0.5rem;"><b>「発注用集計」</b>：教材ごとの合計冊数が集計された表（Excel）がダウンロードされます。問屋さんへの発注に使えます。</li>
            </ul>
        </div>

        <div style="margin-bottom: 2rem;">
            <h3 style="font-size: 1.1rem; border-left: 4px solid var(--text-muted, #64748b); padding-left: 0.75rem; margin-bottom: 1rem;">4. その他の便利機能</h3>
            <ul style="margin-left: 1.5rem; margin-bottom: 1rem;">
                <li style="margin-bottom: 0.5rem;"><b>カートコピー</b>：Aさんのカート内容をBさんにそのまま丸写しできます。兄弟や同じカリキュラムの生徒に便利です。</li>
                <li style="margin-bottom: 0.5rem;"><b>教材の一括削除</b>：左メニュー「教材管理」で、不要な教材の左側をチェックし、「選択を一括削除」でまとめて消せます。</li>
                <li style="margin-bottom: 0.5rem;"><b>ダークモード</b>：左メニューの一番下にあるスイッチで、画面を暗く目に優しい色に変更できます。</li>
            </ul>
        </div>
    `;

    grid.appendChild(content);
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


// === DARK MODE ===

function initDarkMode() {
    const saved = localStorage.getItem('catabooks_darkmode');
    if (saved === 'true') {
        document.body.classList.add('dark-mode');
    }
    const toggle = document.getElementById('darkModeToggle');
    if (toggle) {
        toggle.checked = document.body.classList.contains('dark-mode');
        toggle.addEventListener('change', () => {
            document.body.classList.toggle('dark-mode');
            localStorage.setItem('catabooks_darkmode', document.body.classList.contains('dark-mode'));
        });
    }
}


// === CART COPY ===

async function copyCartToStudent() {
    if (!currentState.currentStudentId) {
        alert('コピー元の生徒を選択してください');
        return;
    }
    if (currentState.currentCart.length === 0) {
        alert('コピー元のカートが空です');
        return;
    }

    // Build target student list (exclude current)
    const others = currentState.students.filter(s => s.id !== currentState.currentStudentId);
    if (others.length === 0) {
        alert('コピー先の生徒がいません');
        return;
    }

    let msg = 'コピー先の生徒を番号で選択:\n';
    others.forEach((s, i) => { msg += `${i + 1}. ${s.name} ${s.grade ? `(${s.grade})` : ''}\n`; });
    const choice = prompt(msg);
    if (!choice) return;

    const idx = parseInt(choice) - 1;
    if (idx < 0 || idx >= others.length) {
        alert('無効な選択です');
        return;
    }

    const targetStudent = others[idx];
    let addCount = 0, skipCount = 0;

    for (const item of currentState.currentCart) {
        const result = await addToCartDB(targetStudent.id, item.id);
        if (result && !result.duplicate) addCount++;
        else skipCount++;
    }

    await addHistoryRecord('カートコピー',
        `${currentState.students.find(s => s.id === currentState.currentStudentId).name} → ${targetStudent.name} (${addCount}件追加, ${skipCount}件スキップ)`
    );
    alert(`${targetStudent.name}のカートに${addCount}件コピーしました${skipCount > 0 ? `\n(重複スキップ: ${skipCount}件)` : ''}`);
}


// === ORDER HISTORY (Enhanced) ===

async function saveOrderHistory() {
    if (!currentState.currentStudentId || currentState.currentCart.length === 0) {
        alert('生徒とカート内容が必要です');
        return;
    }

    const student = currentState.students.find(s => s.id === currentState.currentStudentId);
    const total = currentState.currentCart.reduce((sum, i) => sum + (parseInt(i.price_retail) || 0), 0);
    const items = currentState.currentCart.map(i => i.title).join(', ');

    await addHistoryRecord('注文確定',
        `${student.name}様 | ¥${total.toLocaleString()} | ${currentState.currentCart.length}点 (${items})`
    );
    alert(`注文履歴を保存しました\n${student.name}様: ${currentState.currentCart.length}点 ¥${total.toLocaleString()}`);
}


// === INVOICE / QUOTE PDF GENERATION ===

async function handleCreateQuote() {
    if (!currentState.currentStudentId || currentState.currentCart.length === 0) {
        alert('生徒を選択し、カートに教材を追加してください');
        return;
    }

    const student = currentState.students.find(s => s.id === currentState.currentStudentId);
    if (!student) return;

    const settings = currentState.settings;
    const cartItems = currentState.currentCart;

    try {
        // --- Populate the hidden invoice template ---
        const template = document.getElementById('invoice-template');
        const q = (sel) => template.querySelector(sel);

        // Logo
        const savedLogo = localStorage.getItem('invoiceLogo');
        const logoContainer = q('#pdf-logo-container');
        const logoImg = q('#pdf-logo-img');
        if (savedLogo && logoContainer && logoImg) {
            logoImg.src = savedLogo;
            logoContainer.style.display = 'block';
        } else if (logoContainer) {
            logoContainer.style.display = 'none';
        }

        // Sender info
        q('#pdf-sender-name').textContent = settings.schoolName || '';
        const addrVal = settings.address || '';
        q('#pdf-sender-address').innerHTML = addrVal.replace(/\n/g, '<br>');
        q('#pdf-sender-phone').textContent = settings.phone ? 'TEL: ' + settings.phone : '';
        q('#pdf-sender-reg').textContent = settings.regNum ? '登録番号: ' + settings.regNum : '';

        // Date
        const now = new Date();
        q('#pdf-date').textContent = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

        // Recipient (様 / 御中 auto-detection)
        let title = '様';
        const recipientName = student.name;
        if (recipientName.includes('株式会社') || recipientName.includes('有限会社') || recipientName.includes('合同会社')) {
            title = '御中';
        }
        q('#pdf-recipient-name').textContent = `${recipientName} ${title}`;

        // Table items
        const tbody = q('#pdf-table-body');
        tbody.innerHTML = '';
        let subtotal = 0;

        cartItems.forEach(item => {
            const price = parseInt(item.price_retail) || 0;
            subtotal += price;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.title}</td>
                <td>¥${price.toLocaleString()}</td>
                <td>1</td>
                <td>¥${price.toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });

        // Handling fee
        if (settings.useHandlingFee && settings.handlingFeeAmount > 0) {
            subtotal += settings.handlingFeeAmount;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>事務手数料</td>
                <td>¥${settings.handlingFeeAmount.toLocaleString()}</td>
                <td>1</td>
                <td>¥${settings.handlingFeeAmount.toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        }

        q('#pdf-subtotal').textContent = '¥' + subtotal.toLocaleString();
        q('#pdf-total-amount').textContent = subtotal.toLocaleString();

        // Payment / Bank info footer
        const bankInfoContainer = q('#pdf-bank-info');
        const method = settings.paymentMethod || 'bank';
        let deadlineStr = '';
        if (settings.paymentDeadline) {
            const d = new Date(settings.paymentDeadline);
            deadlineStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
        }

        if (method === 'bank') {
            const bankText = settings.bankDetails || '';
            let content = `<strong>【お振込先】</strong><br>${bankText.replace(/\n/g, '<br>')}`;
            if (deadlineStr) {
                content += `<br><br><strong>お振込み期限：${deadlineStr}</strong>`;
            }
            bankInfoContainer.innerHTML = content;
        } else {
            let content = `<strong>【お支払い方法】</strong><br>ご登録いただいた口座より自動引き落としとなります。<br>`;
            if (deadlineStr) {
                content += `<strong>お引き落とし日：${deadlineStr}</strong><br>`;
            }
            bankInfoContainer.innerHTML = content;
        }

        // --- Generate PDF with html2canvas + jsPDF ---
        // Move template visible briefly for rendering
        const container = document.getElementById('invoice-template-container');
        container.style.position = 'fixed';
        container.style.left = '0';
        container.style.top = '0';
        container.style.zIndex = '-9999';
        container.style.opacity = '0';
        container.style.pointerEvents = 'none';
        container.style.width = '210mm';

        await document.fonts.ready;
        await new Promise(r => setTimeout(r, 300));

        const canvas = await html2canvas(template, {
            scale: 1.5,
            useCORS: true,
            logging: false,
            windowWidth: 794,
            backgroundColor: '#FFFFFF'
        });

        // Reset container position
        container.style.position = 'absolute';
        container.style.left = '-9999px';

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });

        const imgWidth = 210;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);

        // Generate filename
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const fileName = `請求書_${student.name}_${dateStr}.pdf`;
        pdf.save(fileName);

        await addHistoryRecord('請求書作成',
            `${student.name}様 | ¥${subtotal.toLocaleString()} | ${cartItems.length}点`
        );

    } catch (err) {
        console.error('PDF generation error:', err);
        alert('請求書の生成に失敗しました: ' + err.message);
    }
}
