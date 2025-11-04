// Workers CRUD operations

import { collection, addDoc, updateDoc, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export async function addWorker(db, data) {
	const ref = await addDoc(collection(db, 'workers'), data);
	return ref.id;
}

export async function updateWorker(db, id, data) {
	await updateDoc(doc(db, 'workers', id), data);
}

export async function deleteWorker(db, id) {
	await deleteDoc(doc(db, 'workers', id));
}

export default { addWorker, updateWorker, deleteWorker };

