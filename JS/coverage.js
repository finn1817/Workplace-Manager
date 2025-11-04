// Coverage module: shift postings, applications, coverage requests, active coverage

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

// SHIFT POSTINGS (open shifts to be covered)
export async function listShiftPostings(db, { status } = {}) {
  let qRef = collection(db, 'shift_postings');
  if (status) qRef = query(qRef, where('status', '==', status));
  const snap = await getDocs(qRef);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createShiftPosting(db, posting) {
  const data = { ...posting, status: posting.status || 'open', createdAt: new Date().toISOString() };
  const ref = await addDoc(collection(db, 'shift_postings'), data);
  return ref.id;
}

export async function closeShiftPosting(db, postingId) {
  await updateDoc(doc(db, 'shift_postings', postingId), { status: 'closed', closedAt: new Date().toISOString() });
}

// APPLICATIONS to a posting (subcollection)
export async function listApplications(db, postingId) {
  const snap = await getDocs(collection(db, `shift_postings/${postingId}/applications`));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function applyToPosting(db, postingId, { applicantEmail, note }) {
  const data = { applicantEmail, note: note || '', createdAt: new Date().toISOString(), status: 'pending' };
  const ref = await addDoc(collection(db, `shift_postings/${postingId}/applications`), data);
  return ref.id;
}

export async function approveApplication(db, postingId, applicationId) {
  // mark selected application
  await updateDoc(doc(db, `shift_postings/${postingId}/applications/${applicationId}`), { status: 'approved', approvedAt: new Date().toISOString() });
  // close posting
  await updateDoc(doc(db, 'shift_postings', postingId), { status: 'filled', filledAt: new Date().toISOString() });
  // record in active coverage
  const postingSnap = (await getDocs(query(collection(db, 'shift_postings'), where('__name__','==', postingId))));
  let posting = null; postingSnap.forEach(d => posting = { id: d.id, ...d.data() });
  await addDoc(collection(db, 'active_coverage'), { postingId, applicationId, createdAt: new Date().toISOString(), posting });
}

// COVERAGE REQUESTS (request coverage for one's own shift)
export async function listCoverageRequests(db, { status } = {}) {
  let qRef = collection(db, 'coverage_requests');
  if (status) qRef = query(qRef, where('status','==', status));
  const snap = await getDocs(qRef);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createCoverageRequest(db, req) {
  const data = { ...req, status: req.status || 'open', createdAt: new Date().toISOString() };
  const ref = await addDoc(collection(db, 'coverage_requests'), data);
  return ref.id;
}

export async function resolveCoverageRequest(db, requestId) {
  await updateDoc(doc(db, 'coverage_requests', requestId), { status: 'resolved', resolvedAt: new Date().toISOString() });
}

// ACTIVE COVERAGE (accepted coverage assignments)
export async function listActiveCoverage(db) {
  const snap = await getDocs(collection(db, 'active_coverage'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Basic renderers
export function renderShiftPostings(items, { onApply, onApprove, onClose } = {}) {
  const wrap = document.createElement('div');
  const table = document.createElement('table');
  table.innerHTML = `<thead><tr><th>Day</th><th>Start</th><th>End</th><th>By</th><th>Status</th><th>Actions</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  items.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.day||''}</td><td>${p.start||''}</td><td>${p.end||''}</td><td>${p.posterEmail||''}</td><td>${p.status||''}</td><td></td>`;
    const actions = document.createElement('div');
    const bApply = document.createElement('button'); bApply.className='btn'; bApply.textContent='Apply'; bApply.onclick = () => onApply && onApply(p.id);
    const bApprove = document.createElement('button'); bApprove.className='btn'; bApprove.textContent='Approve'; bApprove.onclick = () => onApprove && onApprove(p.id);
    const bClose = document.createElement('button'); bClose.className='btn'; bClose.style.background='#b91c1c'; bClose.textContent='Close'; bClose.onclick = () => onClose && onClose(p.id);
    actions.append(bApply, bApprove, bClose);
    tr.querySelector('td:last-child').appendChild(actions);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

export function renderCoverageRequests(items, { onResolve } = {}) {
  const wrap = document.createElement('div');
  const ul = document.createElement('ul'); ul.style.listStyle='none'; ul.style.padding=0;
  items.forEach(r => {
    const li = document.createElement('li'); li.style.padding='.25rem 0';
    li.textContent = `${r.day||''} ${r.start||''}-${r.end||''} — ${r.requestorEmail||''} [${r.status||''}]`;
    const btn = document.createElement('button'); btn.className='btn'; btn.textContent='Resolve'; btn.onclick = () => onResolve && onResolve(r.id);
    li.appendChild(btn);
    ul.appendChild(li);
  });
  wrap.appendChild(ul);
  return wrap;
}

export function renderActiveCoverage(items) {
  const wrap = document.createElement('div');
  const ul = document.createElement('ul'); ul.style.listStyle='none'; ul.style.padding=0;
  items.forEach(a => {
    const li = document.createElement('li'); li.style.padding='.25rem 0';
    const p = a.posting || {}; li.textContent = `Posting ${a.postingId} — ${p.day||''} ${p.start||''}-${p.end||''} [filled]`;
    ul.appendChild(li);
  });
  wrap.appendChild(ul);
  return wrap;
}

export function renderCreatePosting({ onCreate, posterEmail }) {
  const box = document.createElement('div');
  box.style.background = '#f1f5f9'; box.style.padding = '0.75rem'; box.style.borderRadius = '8px';
  const day = document.createElement('input'); day.placeholder='Day (e.g., Monday)'; day.style.display='block'; day.style.marginBottom='.5rem';
  const start = document.createElement('input'); start.placeholder='Start (e.g., 10:00)'; start.style.display='block'; start.style.marginBottom='.5rem';
  const end = document.createElement('input'); end.placeholder='End (e.g., 14:00)'; end.style.display='block'; end.style.marginBottom='.5rem';
  const btn = document.createElement('button'); btn.className='btn btn-primary'; btn.textContent='Create Posting';
  btn.onclick = async () => { const p = { day: day.value.trim(), start: start.value.trim(), end: end.value.trim(), posterEmail }; if (!p.day||!p.start||!p.end) return alert('All fields required'); await onCreate(p); day.value=''; start.value=''; end.value=''; };
  box.append(day, start, end, btn); return box;
}

export function renderCreateCoverageRequest({ onCreate, requestorEmail }) {
  const box = document.createElement('div');
  box.style.background = '#f1f5f9'; box.style.padding = '0.75rem'; box.style.borderRadius = '8px';
  const day = document.createElement('input'); day.placeholder='Day'; day.style.display='block'; day.style.marginBottom='.5rem';
  const start = document.createElement('input'); start.placeholder='Start'; start.style.display='block'; start.style.marginBottom='.5rem';
  const end = document.createElement('input'); end.placeholder='End'; end.style.display='block'; end.style.marginBottom='.5rem';
  const btn = document.createElement('button'); btn.className='btn btn-primary'; btn.textContent='Request Coverage';
  btn.onclick = async () => { const r = { day: day.value.trim(), start: start.value.trim(), end: end.value.trim(), requestorEmail }; if (!r.day||!r.start||!r.end) return alert('All fields required'); await onCreate(r); day.value=''; start.value=''; end.value=''; };
  box.append(day, start, end, btn); return box;
}

export default {
  listShiftPostings, createShiftPosting, closeShiftPosting, listApplications, applyToPosting, approveApplication,
  listCoverageRequests, createCoverageRequest, resolveCoverageRequest, listActiveCoverage,
  renderShiftPostings, renderCoverageRequests, renderActiveCoverage, renderCreatePosting, renderCreateCoverageRequest,
};
