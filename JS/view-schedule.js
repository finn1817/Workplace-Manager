// Clean schedule viewer with Text and Grid views
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Load the current active schedule from Firestore
 */
export async function loadCurrentSchedule(db) {
	const q = query(collection(db, 'schedules'), where('isCurrent', '==', true));
	const snap = await getDocs(q);
	if (snap.empty) return null;
	const doc = snap.docs[0];
	return { id: doc.id, ...doc.data() };
}

/**
 * Format minutes since midnight to 12-hour time (e.g., 540 -> "9:00 AM")
 */
function formatTime(minutes) {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	const period = hours >= 12 ? 'PM' : 'AM';
	const displayHour = hours % 12 || 12;
	return `${displayHour}:${String(mins).padStart(2, '0')} ${period}`;
}

/**
 * Render schedule with two view modes: Text and Grid
 */
export function renderSchedule(scheduleData) {
	if (!scheduleData || !scheduleData.schedule) {
		const div = document.createElement('div');
		div.style.cssText = 'background: #7f1d1d; color: #fca5a5; padding: 1rem; border-radius: 8px; border-left: 4px solid #ef4444;';
		div.textContent = 'No schedule data available';
		return div;
	}

	const container = document.createElement('div');
	container.style.cssText = 'padding: 1rem;';

	// Header with title and timestamp
	const header = document.createElement('div');
	header.style.cssText = 'background: #1e293b; border-left: 4px solid #60a5fa; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;';

	if (scheduleData.title) {
		const title = document.createElement('h2');
		title.textContent = scheduleData.title;
		title.style.cssText = 'margin: 0 0 0.5rem 0; color: #60a5fa; font-size: 1.5rem;';
		header.appendChild(title);
	}

	if (scheduleData.createdAtFormatted) {
		const timestamp = document.createElement('div');
		timestamp.textContent = '📅 ' + scheduleData.createdAtFormatted;
		timestamp.style.cssText = 'color: #94a3b8; font-size: 0.9rem;';
		header.appendChild(timestamp);
	}

	container.appendChild(header);

	// View toggle buttons
	const toggleBar = document.createElement('div');
	toggleBar.style.cssText = 'display: flex; gap: 0.75rem; margin-bottom: 1.5rem;';

	const btnText = document.createElement('button');
	btnText.textContent = '📋 Text View';
	btnText.setAttribute('data-view', 'text');
	btnText.style.cssText = 'padding: 0.6rem 1.2rem; background: #60a5fa; color: #000; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.95rem;';

	const btnGrid = document.createElement('button');
	btnGrid.textContent = '📊 Grid View';
	btnGrid.setAttribute('data-view', 'grid');
	btnGrid.style.cssText = 'padding: 0.6rem 1.2rem; background: #374151; color: #e5e7eb; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.95rem;';

	toggleBar.appendChild(btnText);
	toggleBar.appendChild(btnGrid);
	container.appendChild(toggleBar);

	// Text view container
	const textView = buildTextView(scheduleData.schedule);
	container.appendChild(textView);

	// Grid view container
	const gridView = buildGridView(scheduleData.schedule);
	gridView.style.display = 'none';
	container.appendChild(gridView);

	// Set up toggle functionality
	btnText.onclick = () => {
		textView.style.display = 'block';
		gridView.style.display = 'none';
		btnText.style.background = '#60a5fa';
		btnText.style.color = '#000';
		btnGrid.style.background = '#374151';
		btnGrid.style.color = '#e5e7eb';
	};

	btnGrid.onclick = () => {
		textView.style.display = 'none';
		gridView.style.display = 'block';
		btnText.style.background = '#374151';
		btnText.style.color = '#e5e7eb';
		btnGrid.style.background = '#60a5fa';
		btnGrid.style.color = '#000';
	};

	return container;
}

function buildTextView(schedule) {
	const view = document.createElement('div');

	DAYS.forEach(day => {
		const slots = (schedule[day] || []).slice().sort((a,b)=>a.start-b.start);
		if (slots.length === 0) return;

		const dayHeader = document.createElement('h3');
		dayHeader.textContent = day;
		dayHeader.style.cssText = 'margin: 1.5rem 0 0.75rem 0; color: #60a5fa; font-size: 1.25rem; border-bottom: 2px solid #1e293b; padding-bottom: 0.5rem;';
		view.appendChild(dayHeader);

		// Merge adjacent hour slots into contiguous segments per worker
		const segments = [];
		let active = new Map(); // key -> {start, end, worker, unfilled}

		for (const s of slots) {
			// Build current map of workers for this slot (or an UNFILLED token)
			const current = new Map();
			const assignedList = (s.assigned && s.assigned.length > 0) ? s.assigned : [{ name:'Unfilled', email:'__UNFILLED__', unfilled:true }];

			assignedList.forEach(a => {
				const key = a.email || a.name || (a.unfilled ? '__UNFILLED__' : 'unknown');
				if (active.has(key)) {
					const seg = active.get(key);
					seg.end = s.end; // extend
					current.set(key, seg);
				} else {
					const seg = { start: s.start, end: s.end, worker: a, unfilled: !!a.unfilled };
					current.set(key, seg);
				}
			});

			// Close any segments that are no longer active this hour
			for (const [k, seg] of active.entries()) {
				if (!current.has(k)) segments.push(seg);
			}

			active = current;
		}

		// Close remaining open segments at end of day
		for (const [, seg] of active.entries()) segments.push(seg);

		// Sort segments chronologically
		segments.sort((a,b)=> a.start - b.start || (a.worker?.name||'').localeCompare(b.worker?.name||''));

		// Render merged segments
		segments.forEach(seg => {
			const item = document.createElement('div');
			item.style.cssText = 'background: #1e293b; padding: 0.75rem 1rem; border-radius: 6px; border-left: 3px solid #475569; margin-bottom: 0.5rem;';

			const timeSpan = document.createElement('strong');
			timeSpan.textContent = `${formatTime(seg.start)} - ${formatTime(seg.end)}`;
			timeSpan.style.cssText = 'color: #e5e7eb; font-size: 1rem;';

			const workerList = document.createElement('div');
			workerList.style.cssText = 'margin-top: 0.5rem; color: #94a3b8; font-size: 0.9rem;';

			if (seg.unfilled) {
				workerList.textContent = '⚠️ Unfilled';
				workerList.style.color = '#fbbf24';
			} else {
				const worker = seg.worker || {};
				const badge = document.createElement('span');
				badge.textContent = worker.name || worker.email || 'Unknown';
				badge.style.cssText = `display: inline-block; margin: 0.25rem 0.5rem 0.25rem 0; padding: 0.25rem 0.6rem; background: ${worker.ws ? '#065f46' : '#1e3a8a'}; color: #fff; border-radius: 4px; font-size: 0.85rem;`;
				if (worker.ws) badge.title = 'Work Study';
				workerList.appendChild(badge);
			}

			item.appendChild(timeSpan);
			item.appendChild(workerList);
			view.appendChild(item);
		});
	});

	return view;
}

function buildGridView(schedule) {
	const view = document.createElement('div');
	view.style.cssText = 'overflow-x: auto;';

	const allTimeSlots = new Set();
	DAYS.forEach(day => {
		const shifts = schedule[day] || [];
		shifts.forEach(shift => {
			allTimeSlots.add(`${shift.start}-${shift.end}`);
		});
	});

	const sortedSlots = Array.from(allTimeSlots).sort((a, b) => {
		const [startA] = a.split('-').map(Number);
		const [startB] = b.split('-').map(Number);
		return startA - startB;
	});

	const table = document.createElement('table');
	table.style.cssText = 'width: 100%; border-collapse: collapse; background: #0f172a; border-radius: 8px; overflow: hidden;';

	const thead = document.createElement('thead');
	const headerRow = document.createElement('tr');

	const timeHeader = document.createElement('th');
	timeHeader.textContent = 'Time';
	timeHeader.style.cssText = 'padding: 1rem; background: #1e293b; color: #60a5fa; text-align: left; border: 1px solid #1f2937; position: sticky; left: 0; z-index: 10; min-width: 150px;';
	headerRow.appendChild(timeHeader);

	DAYS.forEach(day => {
		const th = document.createElement('th');
		th.textContent = day;
		th.style.cssText = 'padding: 1rem; background: #1e293b; color: #60a5fa; text-align: center; border: 1px solid #1f2937; min-width: 140px;';
		headerRow.appendChild(th);
	});

	thead.appendChild(headerRow);
	table.appendChild(thead);

	const tbody = document.createElement('tbody');
	sortedSlots.forEach(slotKey => {
		const [start, end] = slotKey.split('-').map(Number);
		const row = document.createElement('tr');

		const timeCell = document.createElement('td');
		timeCell.textContent = `${formatTime(start)} - ${formatTime(end)}`;
		timeCell.style.cssText = 'padding: 0.75rem 1rem; background: #0f172a; color: #e5e7eb; font-weight: 600; border: 1px solid #1f2937; position: sticky; left: 0; z-index: 5;';
		row.appendChild(timeCell);

		DAYS.forEach(day => {
			const td = document.createElement('td');
			td.style.cssText = 'padding: 0.5rem; border: 1px solid #1f2937; vertical-align: top; background: #0b0b0b;';

			const shifts = schedule[day] || [];
			const matchingShift = shifts.find(s => s.start === start && s.end === end);

			if (matchingShift && matchingShift.assigned && matchingShift.assigned.length > 0) {
				matchingShift.assigned.forEach(worker => {
					const badge = document.createElement('div');
					badge.textContent = worker.name || worker.email || 'Unknown';
					badge.style.cssText = `padding: 0.3rem 0.5rem; margin: 0.25rem 0; background: ${worker.ws ? '#065f46' : '#1e3a8a'}; color: #fff; border-radius: 4px; font-size: 0.8rem; text-align: center;`;
					if (worker.ws) badge.title = 'Work Study';
					td.appendChild(badge);
				});
			} else if (matchingShift) {
				const emptyText = document.createElement('span');
				emptyText.textContent = '—';
				emptyText.style.cssText = 'color: #475569; font-style: italic; font-size: 0.85rem;';
				td.appendChild(emptyText);
			} else {
				td.style.background = '#030712';
			}

			row.appendChild(td);
		});

		tbody.appendChild(row);
	});

	table.appendChild(tbody);
	view.appendChild(table);

	return view;
}

export default { loadCurrentSchedule, renderSchedule };
