// Optional: Auth helpers mirroring index.html logic using the Auth project

import { AUTH_APP } from '../firebase/config.js';
import { getFirestore, collection, query, where, getDocs, addDoc, updateDoc, doc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const authDb = getFirestore(AUTH_APP);

export async function login(email, password) {
	const usersRef = collection(authDb, 'users');
	const q = query(usersRef, where('email', '==', email));
	const snapshot = await getDocs(q);
	let userData = null; snapshot.forEach(docu => userData = { id: docu.id, ...docu.data() });
	if (!userData) throw new Error('User not found');
	if (userData.password !== password) throw new Error('Invalid password');
	if (userData.suspended === true) throw new Error('Account suspended');
	await updateDoc(doc(authDb, 'users', userData.id), { loginTime: new Date().toISOString() });
	return userData;
}

export async function register({ firstName, lastName, email, password, phone }) {
	const usersRef = collection(authDb, 'users');
	const q = query(usersRef, where('email', '==', email));
	const querySnapshot = await getDocs(q);
	if (!querySnapshot.empty) throw new Error('duplicate');
	const newUserRef = await addDoc(usersRef, { firstName, lastName, phone, email, password, isAdmin: 0, suspended: false, loginTime: new Date().toISOString() });
	return newUserRef.id;
}

export default { login, register };

