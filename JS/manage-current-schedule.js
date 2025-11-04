// Manage current schedule helpers

import { collection, getDocs, query, where, updateDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export async function setOnlyCurrentSchedule(db, scheduleId) {
	const snap = await getDocs(query(collection(db, 'schedules'), where('isCurrent','==',true)));
	// Clear existing current
	const ops = [];
	snap.forEach(d => { if (d.id !== scheduleId) ops.push(updateDoc(d.ref, { isCurrent:false })); });
	await Promise.all(ops);
	// Set desired current
	const target = snap.docs.find(d=>d.id===scheduleId);
	if (target) await updateDoc(target.ref, { isCurrent:true });
}

export default { setOnlyCurrentSchedule };

