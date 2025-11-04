// Workers listing and table rendering

import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export async function loadWorkers(db) {
	const snap = await getDocs(collection(db, 'workers'));
	return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function renderWorkers(workers, { onEdit, onDelete } = {}) {
	const wrapper = document.createElement('div');
	const table = document.createElement('table');
	const thead = document.createElement('thead');
	thead.innerHTML = `<tr>
		<th>First</th><th>Last</th><th>Email</th><th>Work Study</th><th>Availability</th><th>Actions</th>
	</tr>`;
	table.appendChild(thead);
	const tbody = document.createElement('tbody');
	workers.forEach(w => {
		const tr = document.createElement('tr');
		const ws = (w.workStudy===true || String(w['Work Study']).toLowerCase()==='yes');
		tr.innerHTML = `
			<td>${w['First Name']||''}</td>
			<td>${w['Last Name']||''}</td>
			<td>${w['Email']||''}</td>
			<td>${ws ? 'Yes' : 'No'}</td>
			<td>${w['Availability']||''}</td>
			<td></td>`;
		const actions = document.createElement('div');
		const btnE = document.createElement('button'); btnE.textContent='Edit'; btnE.className='btn'; btnE.onclick = async ()=>{
			const data = await promptEditWorker(w);
			if (data && onEdit) await onEdit(w.id, data);
		};
		const btnD = document.createElement('button'); btnD.textContent='Delete'; btnD.className='btn'; btnD.style.background='#b91c1c'; btnD.onclick = ()=> onDelete && onDelete(w.id);
		actions.append(btnE, btnD);
		tr.querySelector('td:last-child').appendChild(actions);
		tbody.appendChild(tr);
	});
	table.appendChild(tbody);
	wrapper.appendChild(table);
	return wrapper;
}

async function promptEditWorker(w) {
	const firstName = prompt('First Name', w['First Name']||''); if (firstName===null) return null;
	const lastName = prompt('Last Name', w['Last Name']||''); if (lastName===null) return null;
	const email = prompt('Email', w['Email']||''); if (email===null) return null;
	const wsInput = prompt('Work Study? (Yes/No)', (w.workStudy===true || String(w['Work Study']).toLowerCase()==='yes') ? 'Yes' : 'No'); if (wsInput===null) return null;
	const workStudy = /^y(es)?$/i.test(wsInput.trim());
	const availability = prompt('Availability (e.g., Mon 10am-2pm, Tue 1pm-5pm)', w['Availability']||''); if (availability===null) return null;
	return { 'First Name': firstName, 'Last Name': lastName, 'Email': email, workStudy, 'Availability': availability };
}

export default { loadWorkers, renderWorkers };

