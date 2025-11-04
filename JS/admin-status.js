// Admin status utilities: read from Auth DB (users collection) and guard UI/pages
import { AUTH_APP } from '../firebase/config.js';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const authDb = getFirestore(AUTH_APP);

export async function fetchUserRecord(email) {
	if (!email) return null;
	const q = query(collection(authDb, 'users'), where('email','==', email));
	const snap = await getDocs(q);
	let user = null; snap.forEach(d => user = { id: d.id, ...d.data() });
	return user;
}

export async function isAdminUser(email) {
	const rec = await fetchUserRecord(email);
	const val = rec && (rec.isAdmin === 1 || rec.isAdmin === true);
	// Keep localStorage in sync for convenience
	try {
		const local = JSON.parse(localStorage.getItem('user')||'{}');
		if (local && local.email === email) {
			local.isAdmin = !!val; localStorage.setItem('user', JSON.stringify(local));
		}
	} catch {}
	return !!val;
}

export async function guardAdminOrRedirect() {
	const local = JSON.parse(localStorage.getItem('user')||'{}');
	if (!local || !local.email) { window.location.href = 'index.html'; return false; }
	const ok = await isAdminUser(local.email);
	if (!ok) { alert('Admin only'); window.location.href='dashboard.html'; return false; }
	return true;
}

export async function setAdmin(email, flag) {
	const rec = await fetchUserRecord(email);
	if (!rec) throw new Error('User not found');
	await updateDoc(doc(authDb, 'users', rec.id), { isAdmin: flag ? 1 : 0, updatedAt: new Date().toISOString() });
}

export default { fetchUserRecord, isAdminUser, guardAdminOrRedirect, setAdmin };

