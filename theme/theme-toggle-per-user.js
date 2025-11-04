// Theme loader: persists per user in Auth DB, applies across pages
import '../firebase/config.js';
import { AUTH_APP } from '../firebase/config.js';
import { getFirestore, collection, query, where, getDocs, addDoc, updateDoc, doc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const THEME_LS_KEY = 'wm_theme_pref_v1'; // 'light' | 'dark'
const USER_LS_KEY = 'user';
const db = getFirestore(AUTH_APP);

function applyTheme(theme){
	const t = (theme === 'dark') ? 'dark' : 'light';
	document.documentElement.setAttribute('data-theme', t);
}

function getUser(){
	try { return JSON.parse(localStorage.getItem(USER_LS_KEY)||'{}'); } catch { return {}; }
}

function getThemeFromCache(){
	try { return localStorage.getItem(THEME_LS_KEY) || null; } catch { return null; }
}

function cacheTheme(theme){
	try { localStorage.setItem(THEME_LS_KEY, theme); } catch {}
}

async function fetchThemeFromDb(email){
	if (!email) return null;
	try {
		const snap = await getDocs(query(collection(db,'users'), where('email','==', email)));
		if (snap.empty) return null;
		const d = snap.docs[0].data();
		if (typeof d.darkMode === 'boolean') return d.darkMode ? 'dark' : 'light';
		// support legacy field names
		if (typeof d.isDarkMode === 'boolean') return d.isDarkMode ? 'dark' : 'light';
		return null;
	} catch { return null; }
}

async function saveThemeToDb(email, theme){
	if (!email) return;
	const dark = (theme === 'dark');
	try {
		const snap = await getDocs(query(collection(db,'users'), where('email','==', email)));
		if (snap.empty) {
			await addDoc(collection(db,'users'), { email, darkMode: dark });
		} else {
			await updateDoc(doc(db,'users', snap.docs[0].id), { darkMode: dark });
		}
	} catch {}
}

function ensureToggleButton(initialTheme, onToggle){
	if (document.querySelector('.theme-toggle-btn')) return;
	const btn = document.createElement('button');
	btn.className = 'theme-toggle-btn';
	const setIcon = (t)=>{ btn.textContent = t==='dark' ? '☀' : '🌙'; btn.setAttribute('aria-label', t==='dark'?'Switch to light':'Switch to dark'); };
	setIcon(initialTheme);
	btn.addEventListener('click', ()=>{ onToggle(); setIcon(document.documentElement.getAttribute('data-theme')); });
	document.body.appendChild(btn);
}

(async function initTheme(){
	// Fast apply from cache to avoid flashes
	const cached = getThemeFromCache();
	applyTheme(cached||'light');

	const user = getUser();
	const email = user?.email || null;

	// Load from DB (if available) and reconcile
	const dbTheme = await fetchThemeFromDb(email);
	if (dbTheme && dbTheme !== cached) {
		applyTheme(dbTheme); cacheTheme(dbTheme);
	}

	// Toggle setup
	ensureToggleButton(document.documentElement.getAttribute('data-theme')||'light', async ()=>{
		const next = (document.documentElement.getAttribute('data-theme')==='dark') ? 'light' : 'dark';
		applyTheme(next); cacheTheme(next);
		if (email) await saveThemeToDb(email, next);
	});
})();

