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
	// Accept both abbreviations (Sun..Sat) and full names (Sunday..Saturday)
	const abbrToFull = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
	const fullDays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
	const availability = {};
	if (!text) return availability;
	text.split(/[;,]/).map(s => s.trim()).forEach(block => {
		if (!block) return;
		// Try abbreviated day first
		let m = block.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
		let day = null, start = null, end = null;
		function toMinutes(h, mins, ap) {
			let hh = parseInt(h,10);
			let mm = mins?parseInt(mins,10):0;
			if (ap) { const apL = ap.toLowerCase(); if (apL==='pm' && hh<12) hh+=12; if (apL==='am' && hh===12) hh=0; }
			return hh*60+mm;
		}
		if (m) {
			day = abbrToFull[m[1]];
			start = toMinutes(m[2], m[3], m[4]);
			end   = toMinutes(m[5], m[6], m[7]);
		} else {
			// Try full day names
			const full = block.match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
			if (!full) return;
			day = full[1].charAt(0).toUpperCase()+full[1].slice(1).toLowerCase();
			start = toMinutes(full[2], full[3], full[4]);
			end   = toMinutes(full[5], full[6], full[7]);
		}
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
	DAYS.forEach(d => {
		const o = hours[d];
		if (!o || !o.open || !o.close) { windows[d] = []; return; }
		const [oh, om] = o.open.split(':').map(Number);
		const [ch, cm] = o.close.split(':').map(Number);
		const start = oh*60+om; const end = ch*60+cm;
		const slots = [];
		for (let t=start; t<end; t+=60) slots.push({ start:t, end:Math.min(t+60, end), assigned:[] });
		windows[d] = slots;
	});

	// Segregate workers (Cover concept removed; rely on workStudy boolean only)
	const isWS = w => (w.workStudy === true || String(w['Work Study']||'').toLowerCase() === 'yes' || String(w['Worker Type']||'').toLowerCase()==='work study');
	// Exclude suspended workers if flagged
	const pool = (workers||[]).filter(w => w && w.suspended !== true);
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
		let total = 0;
		const perDay = {};
		for (const d of DAYS) {
			const slots = windows[d]; let day = 0;
			for (const s of slots) {
				if (isAvailable(worker, d, s.start, s.end)) { day += 1; total += 1; }
			}
			perDay[d] = day;
		}
		return { total, perDay };
	}

	// Assign WS 5 hours each
	function fmtHM(min){ const h=Math.floor(min/60),mm=(min%60).toString().padStart(2,'0'); return `${h.toString().padStart(2,'0')}:${mm}`; }

	for (const w of workStudy) {
		const { total:availHrs, perDay } = computeAvailableHoursWithinOpen(w);
		if (availHrs < 5) {
			// Build a concise debug string: open windows by day and matched hours
			const details = DAYS.map(d=>{
				const o = hours[d];
				if (!o || !o.open || !o.close) return `${d}: closed`;
				const [oh,om] = o.open.split(':').map(Number); const [ch,cm]=o.close.split(':').map(Number);
				const openStr = `${o.open}-${o.close}`;
				const matched = perDay[d]||0;
				return `${d}: ${openStr} • match ${matched}h`;
			}).join(' \n ');
			throw new Error(`Work Study availability issue for ${displayName(w)} — requires ≥5 hours within operating hours (has ${availHrs}h).\n\nOpen hours & matches:\n ${details}`);
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

