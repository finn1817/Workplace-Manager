// View current schedule utilities

import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export async function loadCurrentSchedule(db) {
	const snap = await getDocs(query(collection(db, 'schedules'), where('isCurrent','==',true)));
	if (snap.empty) return null;
	const doc = snap.docs[0];
	return { id: doc.id, ...doc.data() };
}

export function renderSchedule(data) {
	const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
	const wrapper = document.createElement('div');
	const fmt = m => {
		const h=Math.floor(m/60),mm=(m%60).toString().padStart(2,'0');
		const ap=h>=12?'PM':'AM'; const hh=(h%12)||12; return `${hh}:${mm} ${ap}`;
	};
	(DAYS).forEach(d => {
		const dayTitle = document.createElement('h3'); dayTitle.textContent = d; wrapper.appendChild(dayTitle);
		const slots = (data.schedule && data.schedule[d]) || [];
		if (!slots.length) { const p=document.createElement('div'); p.textContent='(closed or no slots)'; wrapper.appendChild(p); return; }
		const ul = document.createElement('ul'); ul.style.listStyle='none'; ul.style.padding=0;
		for (const s of slots) {
			const li=document.createElement('li'); li.style.padding='.25rem 0';
			const names = (s.assigned||[]).map(a=>a.name||a.email).join(', ') || '(unfilled)';
			li.textContent = `${fmt(s.start)} - ${fmt(s.end)} — ${names}`; ul.appendChild(li);
		}
		wrapper.appendChild(ul);
	});
	return wrapper;
}

export default { loadCurrentSchedule, renderSchedule };

