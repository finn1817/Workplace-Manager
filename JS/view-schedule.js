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
	toggleBar.style.cssText = 'display:flex; gap:0.5rem; margin:0 0 1rem; position:sticky; top:0; z-index:20; background:#0b0b0b; padding-top:0.25rem;';
	
	const btnList = document.createElement('button');
	btnList.textContent = '📋 List View';
	btnList.className = 'btn';
	btnList.style.cssText = 'padding:0.5rem 1rem; color:#111;';
	
	const btnGrid = document.createElement('button');
	btnGrid.textContent = '📊 Grid View';
	btnGrid.className = 'btn';
	btnGrid.style.cssText = 'padding:0.5rem 1rem; color:#111;';
	
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

	// Helper: build merged runs (contiguous hours) per day per worker
	const keyFor = a => a.email || a.name || 'Unknown';
	function buildRunsForDay(daySlots){
		const runs = [];
		const active = new Map(); // key -> { name, email, ws, start, end }
		for (const s of daySlots) {
			const present = new Set();
			for (const a of (s.assigned||[])){
				const k = keyFor(a);
				present.add(k);
				const cur = active.get(k);
				if (cur && cur.end === s.start) {
					cur.end = s.end; // extend
				} else if (!cur) {
					active.set(k, { name: a.name || a.email || 'Unknown', email: a.email, ws: !!a.ws, start: s.start, end: s.end });
				} else if (cur && cur.end !== s.start) {
					// gap: close previous and start new
					runs.push(cur);
					active.set(k, { name: a.name || a.email || 'Unknown', email: a.email, ws: !!a.ws, start: s.start, end: s.end });
				}
			}
			// close runs for workers not present in this slot
			for (const [k, cur] of Array.from(active.entries())){
				if (!present.has(k)) { runs.push(cur); active.delete(k); }
			}
		}
		// flush remaining
		for (const cur of active.values()) runs.push(cur);
		// sort by start time then name for stable rendering
		runs.sort((a,b)=> a.start!==b.start ? a.start-b.start : (a.name||'').localeCompare(b.name||''));
		return runs;
	}
	
	// Build LIST VIEW with merged contiguous runs per worker
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
		const runs = buildRunsForDay(slots);
		const ul = document.createElement('ul');
		ul.style.listStyle='none';
		ul.style.padding='0';
		ul.style.margin='0';
		if (runs.length===0){
			const li=document.createElement('li'); li.style.color='#94a3b8'; li.style.fontStyle='italic'; li.textContent='(unfilled)'; li.style.padding='.25rem 0'; ul.appendChild(li);
		} else {
			for (const r of runs){
				const li=document.createElement('li');
				li.style.padding='.25rem 0';
				li.style.background='transparent';
				li.style.border='none';
				li.style.color='#e5e7eb';
				li.textContent = `${fmt(r.start)} - ${fmt(r.end)} — ${r.name}`; 
				if (r.ws) li.style.color = '#b8f7c6';
				ul.appendChild(li);
			}
		}
		listContainer.appendChild(ul);
	});
	
	// Build GRID VIEW (div-based with vertical spanning blocks)
	// Collect all unique time slots across all days
	const allSlots = new Set();
	DAYS.forEach(d => {
		const slots = (data.schedule && data.schedule[d]) || [];
		slots.forEach(s => { allSlots.add(`${s.start}-${s.end}`); });
	});
	const sortedSlots = Array.from(allSlots).sort((a,b) => {
		const [startA] = a.split('-').map(Number);
		const [startB] = b.split('-').map(Number);
		return startA - startB;
	});
	const slotStarts = sortedSlots.map(k=>Number(k.split('-')[0]));
	const slotEnds = sortedSlots.map(k=>Number(k.split('-')[1]));
	const startIndex = new Map(slotStarts.map((m,i)=>[m,i]));
	const endIndex = new Map(slotEnds.map((m,i)=>[m,i+1])); // grid-row end is exclusive
	const SLOT_H = 44; // px per hour row

	// Build grid container: first row headers, second row bodies
	const grid = document.createElement('div');
	grid.style.cssText = 'display:grid; grid-template-columns: 140px repeat(7, 1fr); gap:0; width:100%; margin-top:1rem;';

	function headerCell(text){
		const c = document.createElement('div');
		c.textContent = text;
		c.style.cssText = 'padding:0.75rem; border:1px solid #1f2937; background:#1e293b; text-align:center; font-weight:600;';
		return c;
	}

	// Header row
	grid.appendChild(headerCell('Time'));
	DAYS.forEach(d=>grid.appendChild(headerCell(d)));

	// Body: time labels column
	const timeCol = document.createElement('div');
	timeCol.style.cssText = `border:1px solid #1f2937; background:#0f172a; position:relative; height:${sortedSlots.length*SLOT_H}px;`;
	sortedSlots.forEach((key,i)=>{
		const [s,e] = key.split('-').map(Number);
		const row = document.createElement('div');
		row.style.cssText = `position:absolute; left:0; right:0; top:${i*SLOT_H}px; height:${SLOT_H}px; border-top:1px solid #1f2937; display:flex; align-items:center; padding:0 0.75rem; font-weight:600;`;
		row.textContent = `${fmt(s)} - ${fmt(e)}`;
		timeCol.appendChild(row);
	});
	grid.appendChild(timeCol);

	// Build runs per day and render blocks in day columns
	DAYS.forEach(d=>{
		const daySlots = (data.schedule && data.schedule[d]) || [];
		const runs = buildRunsForDay(daySlots);
		const col = document.createElement('div');
		col.style.cssText = `border:1px solid #1f2937; background:#0b0b0b; position:relative; height:${sortedSlots.length*SLOT_H}px;`;
		// background hour lines
		col.style.backgroundImage = `repeating-linear-gradient(to bottom, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 1px, transparent 1px, transparent ${SLOT_H}px)`;
		col.style.backgroundSize = `100% ${SLOT_H}px`;

		for (const r of runs){
			if (!startIndex.has(r.start)) continue; // guard if run start not in global set
			const si = startIndex.get(r.start);
			const ei = endIndex.get(r.end) ?? (si + Math.max(1, Math.round((r.end - r.start)/60)));
			const top = si * SLOT_H + 4;
			const height = Math.max(1, (ei - si) * SLOT_H - 8);
			const block = document.createElement('div');
			block.style.cssText = `position:absolute; left:6px; right:6px; top:${top}px; height:${height}px; border-radius:8px; padding:4px 8px; color:#e5e7eb; display:flex; align-items:center; box-shadow:0 2px 6px rgba(0,0,0,.3); overflow:hidden;`;
			block.style.background = r.ws ? '#065f46' : '#1e3a8a';
			block.title = `${r.name} • ${fmt(r.start)} - ${fmt(r.end)}`;
			const label = document.createElement('div');
			label.style.cssText = 'font-size:0.85rem; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;';
			label.textContent = `${r.name}  (${fmt(r.start)} - ${fmt(r.end)})`;
			block.appendChild(label);
			col.appendChild(block);
		}

		grid.appendChild(col);
	});

	gridContainer.appendChild(grid);
	
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

