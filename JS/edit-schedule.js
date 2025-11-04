// Edit schedule utilities: minimal operations to update an existing schedule doc

import { doc, updateDoc, getDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export async function updateSchedule(db, scheduleId, patch) {
	const ref = doc(db, 'schedules', scheduleId);
	const snap = await getDoc(ref);
	if (!snap.exists()) throw new Error('Schedule not found');
	const data = snap.data();
	const updated = { ...data, ...patch };
	await updateDoc(ref, updated);
	return updated;
}

export default { updateSchedule };

