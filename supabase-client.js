/**
 * Supabase Client Layer
 * 塾教材データベース用 - 全データのCRUD操作をSupabase経由で行う
 * 
 * ★★★ 初回セットアップ ★★★
 * 下記の SUPABASE_URL と SUPABASE_ANON_KEY を
 * Supabaseダッシュボードの Settings > API から取得して設定してください。
 */

const SUPABASE_URL = 'https://jjmkbmmiihljohtaopht.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqbWtibW1paWhsam9odGFvcGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MTQ2OTEsImV4cCI6MjA4OTk5MDY5MX0.t6ehzosLHI3xtWHe-j4VBfyGxXieufhDWX1wsiwCJ2A';

// Supabase Client Init
var supabase;
function initSupabase() {
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('[DB] Supabase client initialized');
    } else {
        console.error('[DB] Supabase SDK not loaded');
    }
}

// ============================================================
// 教材 (Materials) CRUD
// ============================================================

async function loadMaterials() {
    const { data, error } = await supabase
        .from('materials')
        .select('*')
        .order('title');
    if (error) { console.error('[DB] loadMaterials:', error); return []; }
    return data;
}

async function addMaterial(material) {
    const { data, error } = await supabase
        .from('materials')
        .insert([{
            id: material.id,
            title: material.title,
            price_wholesale: parseInt(material.price_wholesale) || 0,
            price_retail: parseInt(material.price_retail) || 0
        }])
        .select();
    if (error) { console.error('[DB] addMaterial:', error); return null; }
    return data[0];
}

async function updateMaterial(id, updates) {
    const { data, error } = await supabase
        .from('materials')
        .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select();
    if (error) { console.error('[DB] updateMaterial:', error); return null; }
    return data[0];
}

async function deleteMaterial(id) {
    const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', id);
    if (error) { console.error('[DB] deleteMaterial:', error); return false; }
    return true;
}

async function bulkInsertMaterials(materials) {
    // Supabase has a limit per request, so chunk it
    const CHUNK_SIZE = 500;
    let inserted = 0;
    for (let i = 0; i < materials.length; i += CHUNK_SIZE) {
        const chunk = materials.slice(i, i + CHUNK_SIZE).map(m => ({
            id: m.id,
            title: m.title,
            price_wholesale: parseInt(m.price_wholesale) || 0,
            price_retail: parseInt(m.price_retail) || 0
        }));
        const { error } = await supabase
            .from('materials')
            .upsert(chunk, { onConflict: 'id' });
        if (error) {
            console.error(`[DB] bulkInsert chunk ${i}:`, error);
        } else {
            inserted += chunk.length;
        }
    }
    return inserted;
}

// ============================================================
// 生徒 (Students) CRUD
// ============================================================

async function loadStudents() {
    const { data, error } = await supabase
        .from('students')
        .select('*')
        .order('created_at');
    if (error) { console.error('[DB] loadStudents:', error); return []; }
    return data;
}

async function addStudent(name, grade) {
    const { data, error } = await supabase
        .from('students')
        .insert([{ name, grade: grade || '' }])
        .select();
    if (error) { console.error('[DB] addStudent:', error); return null; }
    return data[0];
}

async function deleteStudent(studentId) {
    // cart_items are CASCADE deleted
    const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', studentId);
    if (error) { console.error('[DB] deleteStudent:', error); return false; }
    return true;
}

async function deleteAllStudents() {
    const { error } = await supabase
        .from('students')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all
    if (error) { console.error('[DB] deleteAllStudents:', error); return false; }
    return true;
}

async function bulkInsertStudents(students) {
    const records = students.map(s => ({
        name: s.name,
        grade: s.grade || ''
    }));
    const { data, error } = await supabase
        .from('students')
        .insert(records)
        .select();
    if (error) { console.error('[DB] bulkInsertStudents:', error); return []; }
    return data;
}

// ============================================================
// カート (Cart Items) CRUD
// ============================================================

async function getCart(studentId) {
    const { data, error } = await supabase
        .from('cart_items')
        .select(`
            id,
            material_id,
            materials (id, title, price_wholesale, price_retail)
        `)
        .eq('student_id', studentId);
    if (error) { console.error('[DB] getCart:', error); return []; }
    // Flatten: return material objects with cart_item id
    return data.map(ci => ({
        cart_item_id: ci.id,
        ...ci.materials
    }));
}

async function addToCartDB(studentId, materialId) {
    const { data, error } = await supabase
        .from('cart_items')
        .insert([{ student_id: studentId, material_id: materialId }])
        .select();
    if (error) {
        if (error.code === '23505') {
            // Duplicate - already in cart
            return { duplicate: true };
        }
        console.error('[DB] addToCart:', error);
        return null;
    }
    return data[0];
}

async function removeFromCartDB(studentId, materialId) {
    const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('student_id', studentId)
        .eq('material_id', materialId);
    if (error) { console.error('[DB] removeFromCart:', error); return false; }
    return true;
}

async function clearCart(studentId) {
    const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('student_id', studentId);
    if (error) { console.error('[DB] clearCart:', error); return false; }
    return true;
}

async function clearAllCarts() {
    const { error } = await supabase
        .from('cart_items')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) { console.error('[DB] clearAllCarts:', error); return false; }
    return true;
}

// ============================================================
// お気に入り (Favorites) CRUD
// ============================================================

async function getFavorites() {
    const { data, error } = await supabase
        .from('favorites')
        .select('material_id');
    if (error) { console.error('[DB] getFavorites:', error); return []; }
    return data.map(f => f.material_id);
}

async function addFavorite(materialId) {
    const { error } = await supabase
        .from('favorites')
        .insert([{ material_id: materialId }]);
    if (error && error.code !== '23505') {
        console.error('[DB] addFavorite:', error);
        return false;
    }
    return true;
}

async function removeFavorite(materialId) {
    const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('material_id', materialId);
    if (error) { console.error('[DB] removeFavorite:', error); return false; }
    return true;
}

// ============================================================
// 設定 (Settings) CRUD
// ============================================================

async function loadSettings() {
    const { data, error } = await supabase
        .from('settings')
        .select('*');
    if (error) { console.error('[DB] loadSettings:', error); return {}; }
    const result = {};
    data.forEach(row => { result[row.key] = row.value; });
    return result;
}

async function saveSetting(key, value) {
    const { error } = await supabase
        .from('settings')
        .upsert([{ key, value }], { onConflict: 'key' });
    if (error) { console.error('[DB] saveSetting:', error); return false; }
    return true;
}

// ============================================================
// 履歴 (History) CRUD
// ============================================================

async function addHistoryRecord(type, detail) {
    const { error } = await supabase
        .from('history')
        .insert([{ type, detail }]);
    if (error) { console.error('[DB] addHistory:', error); return false; }
    return true;
}

async function getHistoryRecords(limit = 50) {
    const { data, error } = await supabase
        .from('history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) { console.error('[DB] getHistory:', error); return []; }
    return data;
}

async function clearHistory() {
    const { error } = await supabase
        .from('history')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) { console.error('[DB] clearHistory:', error); return false; }
    return true;
}

// ============================================================
// リアルタイム購読 (Realtime Subscriptions)
// ============================================================

function subscribeToChanges(onMaterialChange, onStudentChange, onCartChange) {
    // Materials changes
    supabase
        .channel('materials-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, 
            payload => { if (onMaterialChange) onMaterialChange(payload); })
        .subscribe();

    // Students changes
    supabase
        .channel('students-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'students' },
            payload => { if (onStudentChange) onStudentChange(payload); })
        .subscribe();

    // Cart changes
    supabase
        .channel('cart-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cart_items' },
            payload => { if (onCartChange) onCartChange(payload); })
        .subscribe();
}
