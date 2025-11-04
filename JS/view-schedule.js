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
	
	// Show title and timestamp if available
	if (data.title || data.createdAtFormatted || data.createdAt) {
		const headerDiv = document.createElement('div');
		headerDiv.style.cssText = 'margin-bottom:1.5rem; padding:1rem; background:#1e293b; border-radius:8px; border-left:4px solid #60a5fa;';
		
		if (data.title) {
			const titleEl = document.createElement('h2');
			titleEl.textContent = data.title;
			titleEl.style.cssText = 'margin:0 0 0.5rem 0; color:#60a5fa; font-size:1.5rem;';
			headerDiv.appendChild(titleEl);
		}
		
		if (data.createdAtFormatted || data.createdAt) {
			const timeEl = document.createElement('div');
			timeEl.textContent = '📅 ' + (data.createdAtFormatted || new Date(data.createdAt).toLocaleString());
			timeEl.style.cssText = 'color:#94a3b8; font-size:0.9rem;';
			headerDiv.appendChild(timeEl);
		}
		
		wrapper.appendChild(headerDiv);
	}
	
	// Create view toggle buttons
	const toggleBar = document.createElement('div');
	toggleBar.style.cssText = 'display:flex; gap:0.5rem; margin-bottom:1rem;';
	
	const btnList = document.createElement('button');
	btnList.textContent = '📋 List View';
	btnList.className = 'btn';
	btnList.style.cssText = 'padding:0.5rem 1rem; color:#000; font-weight:600; cursor:pointer;';
	
	const btnGrid = document.createElement('button');
	btnGrid.textContent = '📊 Grid View';
	btnGrid.className = 'btn';
	btnGrid.style.cssText = 'padding:0.5rem 1rem; color:#000; font-weight:600; cursor:pointer;';
	
	toggleBar.appendChild(btnList);
	toggleBar.appendChild(btnGrid);
	wrapper.appendChild(toggleBar);
	
	// Create containers for both views
	const listContainer = document.createElement('div');
	const gridContainer = document.createElement('div');
	gridContainer.style.display = 'none'; // Start with list view
	
	wrapper.appendChild(listContainer);
	wrapper.appendChild(gridContainer);
	
	const fmt = m => {
		const h=Math.floor(m/60),mm=(m%60).toString().padStart(2,'0');
		const ap=h>=12?'PM':'AM'; const hh=(h%12)||12; return `${hh}:${mm} ${ap}`;
	};
	
	// Build LIST VIEW
	(DAYS).forEach(d => {
		const dayTitle = document.createElement('h3'); 
		dayTitle.textContent = d; 
		dayTitle.style.cssText = 'margin-top:1rem; margin-bottom:0.5rem; color:#60a5fa;';
		listContainer.appendChild(dayTitle);
		const slots = (data.schedule && data.schedule[d]) || [];
		if (!slots.length) { 
			const p=document.createElement('div'); 
			p.textContent='(closed or no slots)'; 
			p.style.cssText = 'color:#94a3b8; font-style:italic; padding:0.25rem 0;';
			listContainer.appendChild(p); 
			return; 
		}
		const ul = document.createElement('ul'); 
		ul.style.listStyle='none'; 
		ul.style.padding=0;
		for (const s of slots) {
			const li=document.createElement('li'); 
			li.style.padding='.25rem 0';
			const names = (s.assigned||[]).map(a=>a.name||a.email).join(', ') || '(unfilled)';
			li.textContent = `${fmt(s.start)} - ${fmt(s.end)} — ${names}`; 
			ul.appendChild(li);
		}
		listContainer.appendChild(ul);
	});
	
	// Build GRID VIEW
	const gridTable = document.createElement('table');
	gridTable.style.cssText = 'width:100%; border-collapse:collapse; margin-top:1rem;';
	
	// Collect all unique time slots across all days
	const allSlots = new Set();
	DAYS.forEach(d => {
		const slots = (data.schedule && data.schedule[d]) || [];
		slots.forEach(s => {
			allSlots.add(`${s.start}-${s.end}`);
		});
	});
	const sortedSlots = Array.from(allSlots).sort((a,b) => {
		const [startA] = a.split('-').map(Number);
		const [startB] = b.split('-').map(Number);
		return startA - startB;
	});
	
	// Build header row
	const thead = document.createElement('thead');
	const headerRow = document.createElement('tr');
	const timeHeader = document.createElement('th');
	timeHeader.textContent = 'Time';
	timeHeader.style.cssText = 'padding:0.75rem; border:1px solid #1f2937; background:#1e293b; position:sticky; left:0; z-index:10;';
	headerRow.appendChild(timeHeader);
	
	DAYS.forEach(d => {
		const th = document.createElement('th');
		th.textContent = d;
		th.style.cssText = 'padding:0.75rem; border:1px solid #1f2937; background:#1e293b; text-align:center; min-width:120px;';
		headerRow.appendChild(th);
	});
	thead.appendChild(headerRow);
	gridTable.appendChild(thead);
	
	// Build body rows
	const tbody = document.createElement('tbody');
	sortedSlots.forEach(slotKey => {
		const [start, end] = slotKey.split('-').map(Number);
		const row = document.createElement('tr');
		
		const timeCell = document.createElement('td');
		timeCell.textContent = `${fmt(start)} - ${fmt(end)}`;
		timeCell.style.cssText = 'padding:0.5rem 0.75rem; border:1px solid #1f2937; background:#0f172a; font-weight:600; position:sticky; left:0; z-index:5;';
		row.appendChild(timeCell);
		
		DAYS.forEach(d => {
			const td = document.createElement('td');
			td.style.cssText = 'padding:0.5rem; border:1px solid #1f2937; vertical-align:top; min-width:120px;';
			
			const slots = (data.schedule && data.schedule[d]) || [];
			const matchingSlot = slots.find(s => s.start === start && s.end === end);
			
			if (matchingSlot && matchingSlot.assigned && matchingSlot.assigned.length > 0) {
				const names = matchingSlot.assigned.map(a => {
					const name = a.name || a.email || 'Unknown';
					const span = document.createElement('div');
					span.textContent = name;
					span.style.cssText = 'padding:0.15rem 0.4rem; margin:0.15rem 0; background:#1e3a8a; border-radius:4px; font-size:0.85rem;';
					if (a.ws) {
						span.style.background = '#065f46';
						span.title = 'Work Study';
					}
					return span;
				});
				names.forEach(n => td.appendChild(n));
			} else if (matchingSlot) {
				const emptySpan = document.createElement('span');
				emptySpan.textContent = '(unfilled)';
				emptySpan.style.cssText = 'color:#64748b; font-style:italic; font-size:0.85rem;';
				td.appendChild(emptySpan);
			} else {
				td.style.background = '#0b0b0b';
			}
			
			row.appendChild(td);
		});
		
		tbody.appendChild(row);
	});
	gridTable.appendChild(tbody);
	gridContainer.appendChild(gridTable);
	
	// Toggle functionality
	btnList.onclick = () => {
		listContainer.style.display = 'block';
		gridContainer.style.display = 'none';
		btnList.style.background = '#60a5fa';
		btnList.style.color = '#000';
		btnGrid.style.background = '#475569';
		btnGrid.style.color = '#fff';
	};
	
	btnGrid.onclick = () => {
		listContainer.style.display = 'none';
		gridContainer.style.display = 'block';
		btnList.style.background = '#475569';
		btnList.style.color = '#fff';
		btnGrid.style.background = '#60a5fa';
		btnGrid.style.color = '#000';
	};
	
	// Set initial button states
	btnList.style.background = '#60a5fa';
	btnList.style.color = '#000';
	btnGrid.style.background = '#475569';
	btnGrid.style.color = '#fff';
	
	return wrapper;
}

export default { loadCurrentSchedule, renderSchedule };

