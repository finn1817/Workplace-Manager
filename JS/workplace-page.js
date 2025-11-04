// Shared workplace page bootstrap and UI wiring
// Renders a minimal dashboard with actions: View Current Schedule, Generate Schedule, View Workers, Add Worker

import { useWorkplace, db as activeDb } from './select-workplace.js';
import { generateSchedule, loadHoursOfOperation } from './schedule-generation.js';
import { loadCurrentSchedule, renderSchedule } from './view-schedule.js';
import { loadWorkers, renderWorkers } from './view-workers.js';
import { addWorker, updateWorker, deleteWorker } from './worker-CRUD.js';
import { listAnnouncements, addAnnouncement, updateAnnouncement, deleteAnnouncement, renderAnnouncements, renderAnnouncementComposer } from './announcements.js';
import { isAdminUser } from './admin-status.js';
import { 
	listShiftPostings, createShiftPosting, closeShiftPosting, listApplications, applyToPosting, approveApplication,
	listCoverageRequests, createCoverageRequest, resolveCoverageRequest, listActiveCoverage,
	renderShiftPostings, renderCoverageRequests, renderActiveCoverage, renderCreatePosting, renderCreateCoverageRequest,
} from './coverage.js';

function el(tag, attrs = {}, children = []) {
	const e = document.createElement(tag);
	Object.entries(attrs).forEach(([k, v]) => {
		if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v);
	});
	(Array.isArray(children) ? children : [children]).filter(Boolean).forEach(c => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
	return e;
}

export async function bootstrap({ workplaceId }) {
	// Initialize workplace selection
	useWorkplace(workplaceId);
	const db = activeDb; // stable reference

	const root = document.getElementById('app');
	root.innerHTML = '';

		const header = el('div', { class: 'wp-header' }, [
		el('h1', { class: 'wp-title', html: `Workplace — ${workplaceId.replace(/_/g,' ')}` }),
		el('div', { class: 'wp-actions' }, [
			el('button', { id: 'btnViewCurrent', class: 'btn' }, 'View Current Schedule'),
			el('button', { id: 'btnGenerate', class: 'btn btn-primary' }, 'Generate New Schedule'),
			el('button', { id: 'btnWorkers', class: 'btn' }, 'View Workers'),
				el('button', { id: 'btnAddWorker', class: 'btn btn-success' }, 'Add Worker'),
				el('a', { id: 'btnManageWorkers', class: 'btn', href: `../manage-workers.html?wp=${workplaceId}`, style: 'display:none;background:#ffc107;color:#212529;' }, '👥 Manage Workers'),
				el('button', { id: 'btnAnnouncements', class: 'btn' }, 'Announcements'),
				el('button', { id: 'btnCoverage', class: 'btn' }, 'Coverage')
		])
	]);

	const content = el('div', { id: 'content' }, [
		el('div', { id: 'status', class: 'info', html: 'Select an action above.' })
	]);

	const styles = el('style', { html: `
		body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin:0; background:#f8f9fa; }
		.wp-header { background: #1f2937; color:white; padding: 1rem 1.5rem; display:flex; align-items:center; justify-content:space-between; }
		.wp-title { margin:0; font-size:1.25rem; }
		.btn { padding: .6rem .9rem; border:none; border-radius:8px; background:#374151; color:white; margin-left:.5rem; cursor:pointer; }
		.btn-primary { background:#2563eb; }
		.btn-success { background:#16a34a; }
		.container { max-width:1200px; margin: 1rem auto; padding: 0 1rem; }
		.info { background:#e0f2fe; color:#075985; padding:1rem; border-radius:8px; }
		.error { background:#fee2e2; color:#991b1b; padding:1rem; border-radius:8px; }
		table { width:100%; border-collapse: collapse; margin-top: .5rem; }
		th, td { border-bottom: 1px solid #e5e7eb; text-align:left; padding:.5rem; }
	`});

	const container = el('div', { class: 'container' }, [header, content]);
	document.head.appendChild(styles);
	root.appendChild(container);

	const status = document.getElementById('status');

	document.getElementById('btnViewCurrent').onclick = async () => {
		status.className='info'; status.innerHTML = 'Loading current schedule...';
		try {
			const data = await loadCurrentSchedule(db);
			if (!data) { status.className='info'; status.innerHTML = 'No current schedule found.'; return; }
			content.innerHTML = '';
			content.appendChild(renderSchedule(data));
		} catch (e) { status.className='error'; status.innerHTML = e.message; }
	};

	document.getElementById('btnGenerate').onclick = async () => {
		status.className='info'; status.innerHTML = 'Generating...';
		try {
			await generateSchedule(db, { workplaceId });
			const data = await loadCurrentSchedule(db);
			content.innerHTML = '';
			content.appendChild(renderSchedule(data));
			status.className='info'; status.innerHTML = 'Schedule generated and saved.';
		} catch (e) { status.className='error'; status.innerHTML = e.message; }
	};

	let currentWorkers = [];
	async function showWorkers() {
		status.className='info'; status.innerHTML = 'Loading workers...';
		currentWorkers = await loadWorkers(db);
		content.innerHTML = '';
		content.appendChild(renderWorkers(currentWorkers, {
			onEdit: async (id, data) => { await updateWorker(db, id, data); await showWorkers(); },
			onDelete: async (id) => { if (confirm('Delete this worker?')) { await deleteWorker(db, id); await showWorkers(); } }
		}));
		status.innerHTML = `Loaded ${currentWorkers.length} workers.`;
	}

	document.getElementById('btnWorkers').onclick = showWorkers;

	document.getElementById('btnAddWorker').onclick = async () => {
		const firstName = prompt('First Name'); if (!firstName) return;
		const lastName = prompt('Last Name'); if (!lastName) return;
		const email = prompt('Email'); if (!email) return;
		const wsInput = prompt('Work Study? (Yes/No)', 'No') || 'No';
		const workStudy = /^y(es)?$/i.test(wsInput.trim());
		const availability = prompt('Availability (e.g., Mon 10am-2pm, Tue 1pm-5pm)') || '';
		await addWorker(db, { 'First Name': firstName, 'Last Name': lastName, 'Email': email, workStudy, 'Availability': availability });
		await showWorkers();
	};

		// Admin gating for Manage Workers link
		try {
			const email = JSON.parse(localStorage.getItem('user')||'{}').email;
			if (email && await isAdminUser(email)) {
				const link = document.getElementById('btnManageWorkers');
				if (link) link.style.display='inline-block';
			}
		} catch {}

		// Announcements view
		async function showAnnouncements() {
			status.className='info'; status.innerHTML = 'Loading announcements...';
			const items = await listAnnouncements(db);
			content.innerHTML = '';
			const composer = renderAnnouncementComposer({ onCreate: async ({ title, body, authorEmail }) => { await addAnnouncement(db, { title, body, authorEmail: userEmail() }); await showAnnouncements(); } });
			content.appendChild(composer);
			content.appendChild(renderAnnouncements(items, {
				onEdit: async (id, patch) => { await updateAnnouncement(db, id, patch); await showAnnouncements(); },
				onDelete: async (id) => { await deleteAnnouncement(db, id); await showAnnouncements(); }
			}));
			status.innerHTML = `Loaded ${items.length} announcements.`;
		}
		document.getElementById('btnAnnouncements').onclick = showAnnouncements;

		// Coverage view
		async function showCoverage() {
			status.className='info'; status.innerHTML = 'Loading coverage...';
			content.innerHTML = '';

			// Create posting
			content.appendChild(renderCreatePosting({ onCreate: async (p) => { await createShiftPosting(db, { ...p, posterEmail: userEmail() }); await showCoverage(); }, posterEmail: userEmail() }));

			// Create coverage request
			content.appendChild(renderCreateCoverageRequest({ onCreate: async (r) => { await createCoverageRequest(db, { ...r, requestorEmail: userEmail() }); await showCoverage(); }, requestorEmail: userEmail() }));

			// Shift postings
			const postings = await listShiftPostings(db);
			const postingsView = renderShiftPostings(postings, {
				onApply: async (postingId) => {
					const note = prompt('Application note (optional)') || '';
					await applyToPosting(db, postingId, { applicantEmail: userEmail(), note });
					await showCoverage();
				},
				onApprove: async (postingId) => {
					const apps = await listApplications(db, postingId);
					if (!apps.length) return alert('No applications yet');
					const choice = prompt(`Approve which application? (1-${apps.length})\n` + apps.map((a,i)=>`${i+1}. ${a.applicantEmail}`).join('\n'));
					const idx = parseInt(choice,10)-1; if (isNaN(idx) || idx<0 || idx>=apps.length) return;
					await approveApplication(db, postingId, apps[idx].id);
					await showCoverage();
				},
				onClose: async (postingId) => { await closeShiftPosting(db, postingId); await showCoverage(); }
			});
			content.appendChild(el('h3', {}, 'Shift Postings'));
			content.appendChild(postingsView);

			// Coverage requests
			const requests = await listCoverageRequests(db);
			content.appendChild(el('h3', {}, 'Coverage Requests'));
			content.appendChild(renderCoverageRequests(requests, { onResolve: async (id) => { await resolveCoverageRequest(db, id); await showCoverage(); } }));

			// Active coverage
			const active = await listActiveCoverage(db);
			content.appendChild(el('h3', {}, 'Active Coverage'));
			content.appendChild(renderActiveCoverage(active));

			status.innerHTML = 'Coverage loaded.';
		}
		document.getElementById('btnCoverage').onclick = showCoverage;

		function userEmail() {
			try { const u = JSON.parse(localStorage.getItem('user')||'{}'); return u.email || null; } catch { return null; }
		}

	// Initial content: show hours of operation
	try {
		const hours = await loadHoursOfOperation(db);
		content.innerHTML = '<h3>Hours of Operation</h3>' + '<pre style="background:#fff;border:1px solid #eee;padding:1rem;border-radius:8px;">' + JSON.stringify(hours, null, 2) + '</pre>';
	} catch (e) { status.className='error'; status.innerHTML = e.message; }
}

export default { bootstrap };

