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
	btnList.style.cssText = 'padding:0.5rem 1rem;';
    
	const btnGrid = document.createElement('button');
	btnGrid.textContent = '📊 Grid View';
	btnGrid.className = 'btn';
	btnGrid.style.cssText = 'padding:0.5rem 1rem;';
    
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
	const workerKey = a => (a && (a.email || a.name)) || 'Unknown';
	const hasWorker = (slot, key) => !!(slot && (slot.assigned||[]).some(x => workerKey(x)===key));

	// Build LIST VIEW (original hour-by-hour)
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
    
	// Build GRID VIEW (table-based) with contiguous-border rendering per worker
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
			td.style.cssText = 'padding:0.35rem; border:1px solid #1f2937; vertical-align:top; min-width:140px; background:#0b0b0b;';
            
			const slots = (data.schedule && data.schedule[d]) || [];
			const idx = slots.findIndex(s => s.start === start && s.end === end);
			const matchingSlot = idx>=0 ? slots[idx] : null;
			const prevSlot = idx>0 ? slots[idx-1] : null;
			const nextSlot = (idx>=0 && idx<slots.length-1) ? slots[idx+1] : null;
            
			if (matchingSlot && matchingSlot.assigned && matchingSlot.assigned.length > 0) {
				for (const a of matchingSlot.assigned){
					const key = workerKey(a);
					const startOfRun = !hasWorker(prevSlot, key);
					const endOfRun = !hasWorker(nextSlot, key);
					const chip = document.createElement('div');
					chip.textContent = a.name || a.email || 'Unknown';
					chip.style.cssText = 'padding:0.35rem 0.5rem; background:rgba(30,58,138,.85); color:#e5e7eb; border-left:2px solid #3b82f6; border-right:2px solid #3b82f6; border-radius:0; margin:0;';
					if (a.ws) {
						chip.style.background = 'rgba(6,95,70,.85)';
						chip.style.borderLeftColor = '#34d399';
						chip.style.borderRightColor = '#34d399';
					}
					if (startOfRun) {
						chip.style.borderTop = `2px solid ${a.ws ? '#34d399' : '#3b82f6'}`;
						chip.style.borderTopLeftRadius = '6px';
						chip.style.borderTopRightRadius = '6px';
						chip.style.marginTop = '2px';
					}
					if (endOfRun) {
						chip.style.borderBottom = `2px solid ${a.ws ? '#34d399' : '#3b82f6'}`;
						chip.style.borderBottomLeftRadius = '6px';
						chip.style.borderBottomRightRadius = '6px';
						chip.style.marginBottom = '2px';
					}
					td.appendChild(chip);
				}
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
		btnGrid.style.background = '#475569';
	};
    
	btnGrid.onclick = () => {
		listContainer.style.display = 'none';
		gridContainer.style.display = 'block';
		btnList.style.background = '#475569';
		btnGrid.style.background = '#60a5fa';
	};
    
	// Set initial button states
	btnList.style.background = '#60a5fa';
	btnGrid.style.background = '#475569';
    
	return wrapper;
}

export default { loadCurrentSchedule, renderSchedule };

