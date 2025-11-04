// Schedule generation logic: honors Work Study 5-hour rule, fair fill for regulars, excludes Cover workers

import { collection, getDocs, addDoc, updateDoc, query, where, doc, getDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export async function loadHoursOfOperation(db) {
	try {
		// Prefer deterministic settings doc id to match Manage Hours page
		const preferred = await getDoc(doc(db, 'settings', 'general'));
		if (preferred.exists()) {
			const data = preferred.data() || {};
			if (data.hours_of_operation) return data.hours_of_operation;
		}
		// Fallback: scan settings for any legacy docs
		const settingsSnap = await getDocs(collection(db, 'settings'));
		let hours = null;
		settingsSnap.forEach(d => { const data = d.data(); if (!hours && data && data.hours_of_operation) hours = data.hours_of_operation; });
		return hours || defaultHours();
	} catch {
		return defaultHours();
	}
}

function defaultHours() {
	return {
		Monday: { open: '09:00', close: '17:00' },
		Tuesday: { open: '09:00', close: '17:00' },
		Wednesday: { open: '09:00', close: '17:00' },
		Thursday: { open: '09:00', close: '17:00' },
		Friday: { open: '09:00', close: '17:00' },
		Saturday: { open: null, close: null },
		Sunday: { open: null, close: null }
	};
}

export async function loadWorkers(db) {
	const snap = await getDocs(collection(db, 'workers'));
	return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function parseAvailabilityString(text) {
	// Parse format like "Mon 14:00-19:00, Tue 08:00-13:00"
	const abbrToFull = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
	const availability = {};
	if (!text) return availability;
	
	const blocks = text.split(',').map(s => s.trim());
	blocks.forEach(block => {
		// Match: "Mon 14:00-19:00" or "Monday 14:00-19:00" (colon REQUIRED in HH:MM)
		const match = block.match(/^(\w+)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/i);
		if (!match) return;
		
		const [, dayRaw, startTime, endTime] = match;
		
		// Normalize day name
		const dayLower = dayRaw.toLowerCase();
		const day = abbrToFull[dayRaw] || abbrToFull[dayRaw.slice(0,3)] || 
		            (dayLower === 'sunday' ? 'Sunday' : dayLower === 'monday' ? 'Monday' : 
		             dayLower === 'tuesday' ? 'Tuesday' : dayLower === 'wednesday' ? 'Wednesday' :
		             dayLower === 'thursday' ? 'Thursday' : dayLower === 'friday' ? 'Friday' :
		             dayLower === 'saturday' ? 'Saturday' : null);
		
		if (!day) return;
		
		// Convert HH:MM to minutes
		function parseTime(t) {
			const [h, m] = t.split(':').map(Number);
			return (h * 60) + m;
		}
		
		let start = parseTime(startTime);
		let end = parseTime(endTime);
		
		// Handle cross-midnight (e.g., 18:30-00:00)
		if (end <= start) end = 24 * 60;
		
		if (!availability[day]) availability[day] = [];
		availability[day].push({ start, end });
	});
	
	return availability;
}

function isAvailable(worker, day, startMin, endMin) {
	const slots = (worker.availabilityParsed && worker.availabilityParsed[day]) || [];
	return slots.some(s => s.start <= startMin && s.end >= endMin);
}

export async function generateSchedule(db, { workplaceId }) {
	const workers = await loadWorkers(db);
	return generateScheduleFromWorkers(db, workers, { workplaceId });
}

// New: allow caller to provide selected workers subset
export async function generateScheduleFromWorkers(db, workers, { workplaceId, maxWorkersPerShift=2, maxHoursPerWorker=20, shiftSizes=[5,4,3,2] }={}) {
	const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

	const hours = await loadHoursOfOperation(db);

	// Normalize availability (support legacy field name as well)
	workers.forEach(w => {
		if (typeof w['Availability'] === 'string' && w['Availability'].trim()) {
			w.availabilityParsed = parseAvailabilityString(w['Availability']);
		} else if (typeof w['Days & Times Available'] === 'string' && w['Days & Times Available'].trim()) {
			w.availabilityParsed = parseAvailabilityString(w['Days & Times Available']);
		} else if (w.availability) {
			w.availabilityParsed = w.availability; // already parsed shape
		} else {
			w.availabilityParsed = {};
		}
	});

	// Build open windows per day as 1-hour slots; capacity configurable per slot
	const windows = {};
	function parseTimeToMinutes(str){
		if (!str || typeof str !== 'string') return null;
		const s = str.trim();
		// Try 24h HH:MM first
		let m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
		if (m) return parseInt(m[1],10)*60 + parseInt(m[2],10);
		// Try AM/PM forms like "2:00 PM", "02:30 pm"
		m = s.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
		if (m) {
			let hh = parseInt(m[1],10) || 0; const mm = parseInt(m[2],10) || 0; const ap = m[3].toLowerCase();
			if (ap==='pm' && hh<12) hh+=12; if (ap==='am' && hh===12) hh=0; return hh*60+mm;
		}
		return null; // unsupported format
	}
	DAYS.forEach(d => {
		const o = hours[d];
		if (!o || !o.open || !o.close) { windows[d] = []; return; }
		const start = parseTimeToMinutes(String(o.open));
		const end = parseTimeToMinutes(String(o.close));
		if (start==null || end==null) { windows[d] = []; return; }
		let s = start; let e = end;
		// Support ranges that end at midnight or cross midnight (e <= s). For scheduling, cap at 24:00 of the same day.
		if (e <= s) e = 24*60; // e.g., 16:00-00:00 => 16:00-24:00
		const slots = [];
		for (let t=s; t<e; t+=60) slots.push({ start:t, end:Math.min(t+60, e), assigned:[] });
		windows[d] = slots;
	});

	// Segregate workers (Cover concept removed; rely on workStudy boolean only)
	const isWS = w => (w.workStudy === true || String(w['Work Study']||'').toLowerCase() === 'yes' || String(w['Worker Type']||'').toLowerCase()==='work study');
	// Exclude suspended workers if flagged
	let pool = (workers||[]).filter(w => w && w.suspended !== true);

	// Drop workers with no availability intersecting open hours to avoid cluttering generation
	function hasAnyAvailabilityInOpen(w){
		for (const d of DAYS){
			const slots = windows[d];
			for (const s of slots){ if (isAvailable(w, d, s.start, s.end)) return true; }
		}
		return false;
	}
	pool = pool.filter(hasAnyAvailabilityInOpen);
	const workStudy = pool.filter(isWS);
	const regular = pool.filter(w => !isWS(w));

	const keyFor = w => w['Email'] || w.email || w.id;
	const displayName = w => `${w['First Name']||w.first_name||''} ${w['Last Name']||w.last_name||''}`.trim() || keyFor(w);
	const assignedHours = Object.fromEntries(pool.map(w => [keyFor(w), 0]));

	function canPlaceBlock(day, startIdx, length, worker) {
		const slots = windows[day];
		if (startIdx + length > slots.length) return false;
		for (let i=0;i<length;i++) {
			const s = slots[startIdx+i];
			if (!s) return false;
			if (s.assigned.length >= maxWorkersPerShift) return false;
			if (!isAvailable(worker, day, s.start, s.end)) return false;
		}
		return true;
	}

	function placeBlock(day, startIdx, length, worker) {
		const slots = windows[day];
		const key = keyFor(worker);
		for (let i=0;i<length;i++) {
			const s = slots[startIdx+i];
			s.assigned.push({ email:key, name:displayName(worker), ws:isWS(worker) });
		}
		assignedHours[key] += length; // hours
	}

	function tryAssign(worker, neededHours) {
		let remaining = neededHours;
		const key = keyFor(worker);
		for (const d of DAYS) {
			const slots = windows[d];
			for (let idx=0; idx<slots.length && remaining>0; idx++) {
				const hoursLeft = Math.max(0, maxHoursPerWorker - (assignedHours[key]||0));
				if (hoursLeft <= 0) return remaining <= 0;
				// Try preferred shift sizes (5,4,3,2) without exceeding remaining or hoursLeft
				for (const size of shiftSizes) {
					const take = Math.min(size, remaining, hoursLeft);
					if (take < 1) continue;
					if (canPlaceBlock(d, idx, take, worker)) {
						placeBlock(d, idx, take, worker);
						remaining -= take;
						idx += (take-1); // skip over newly placed block
						break; // move forward after placing one block starting here
					}
				}
			}
		}
		return remaining <= 0;
	}

	// Precheck: each WS must have at least 5 hours of availability within operating hours
	function computeAvailableHoursWithinOpen(worker) {
		let total = 0; const perDay = {}; let maxBlock = 0;
		for (const d of DAYS) {
			const slots = windows[d]; let day = 0; let run = 0;
			for (const s of slots) {
				if (isAvailable(worker, d, s.start, s.end)) { day += 1; total += 1; run += 1; if (run > maxBlock) maxBlock = run; }
				else { run = 0; }
			}
			perDay[d] = day;
		}
		return { total, perDay, maxBlock };
	}

	// Assign WS 5 hours each
	function fmtHM(min){ const h=Math.floor(min/60),mm=(min%60).toString().padStart(2,'0'); return `${h.toString().padStart(2,'0')}:${mm}`; }

	for (const w of workStudy) {
		const { total:availHrs, perDay, maxBlock } = computeAvailableHoursWithinOpen(w);
		if (maxBlock < 5) {
			// Build a concise debug string: open windows by day and matched hours
			const details = DAYS.map(d=>{
				const o = hours[d];
				if (!o || !o.open || !o.close) return `${d}: closed`;
				const openStr = `${o.open}-${o.close}`;
				const matched = perDay[d]||0;
				return `${d}: ${openStr} • match ${matched}h`;
			}).join(' \n ');
			throw new Error(`Work Study availability issue for ${displayName(w)} — needs a contiguous 5h block within operating hours (max block ${maxBlock}h; total ${availHrs}h).\n\nOpen hours & matches:\n ${details}`);
		}
		const ok = tryAssign(w, 5);
		if (!ok) throw new Error(`Work Study availability issue for ${displayName(w)} — they must have at least 5 hours within operating hours.`);
	}

	// Fair fill for regulars
	const totalSlots = Object.values(windows).flat().length * maxWorkersPerShift;
	const wsHours = workStudy.length * 5;
	const remainingTarget = Math.max(0, totalSlots - wsHours);
	const targetPerRegular = regular.length>0 ? remainingTarget/regular.length : 0;
	for (const w of regular) tryAssign(w, targetPerRegular);

	// Upsert current schedule
	const scheduleDoc = { isCurrent:true, createdAt:new Date().toISOString(), workplace:workplaceId, schedule: {}, options:{ maxWorkersPerShift, maxHoursPerWorker, shiftSizes } };
	for (const d of DAYS) scheduleDoc.schedule[d] = windows[d].map(s => ({ start:s.start, end:s.end, assigned:s.assigned }));
	const existing = await getDocs(query(collection(db, 'schedules'), where('isCurrent','==',true)));
	if (!existing.empty) await updateDoc(existing.docs[0].ref, scheduleDoc); else await addDoc(collection(db, 'schedules'), scheduleDoc);
	return scheduleDoc;
}

export default { generateSchedule, generateScheduleFromWorkers, loadHoursOfOperation };

