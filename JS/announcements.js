// Announcements module: list/add/edit/delete

import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export async function listAnnouncements(db) {
  const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addAnnouncement(db, { title, body, authorEmail }) {
  const data = { title, body, authorEmail: authorEmail || null, createdAt: new Date().toISOString() };
  const ref = await addDoc(collection(db, 'announcements'), data);
  return ref.id;
}

export async function updateAnnouncement(db, id, patch) {
  await updateDoc(doc(db, 'announcements', id), patch);
}

export async function deleteAnnouncement(db, id) {
  await deleteDoc(doc(db, 'announcements', id));
}

export function renderAnnouncements(items, { onEdit, onDelete } = {}) {
  const wrap = document.createElement('div');
  const list = document.createElement('div');
  list.style.display = 'grid';
  list.style.gap = '0.75rem';

  items.forEach(a => {
    const card = document.createElement('div');
    card.style.background = '#fff';
    card.style.border = '1px solid #e5e7eb';
    card.style.borderRadius = '8px';
    card.style.padding = '0.75rem 1rem';
    const h = document.createElement('h4'); h.style.margin = '0 0 .25rem'; h.textContent = a.title || '(untitled)';
    const p = document.createElement('p'); p.style.margin = '0.25rem 0 0.5rem'; p.textContent = a.body || '';
    const meta = document.createElement('div'); meta.style.fontSize = '.8rem'; meta.style.color = '#6b7280';
    meta.textContent = `${a.authorEmail || 'Unknown'} • ${a.createdAt ? new Date(a.createdAt).toLocaleString() : ''}`;
    const actions = document.createElement('div'); actions.style.marginTop = '.5rem';
    const be = document.createElement('button'); be.className='btn'; be.textContent='Edit'; be.onclick = async () => { const data = await promptAnnouncementEdit(a); if (data && onEdit) await onEdit(a.id, data); };
    const bd = document.createElement('button'); bd.className='btn'; bd.style.background='#b91c1c'; bd.textContent='Delete'; bd.onclick = async () => { if (onDelete && confirm('Delete this announcement?')) await onDelete(a.id); };
    actions.append(be, bd);
    card.append(h, p, meta, actions);
    list.appendChild(card);
  });

  wrap.appendChild(list);
  return wrap;
}

async function promptAnnouncementEdit(a = {}) {
  const title = prompt('Title', a.title || ''); if (title === null) return null;
  const body = prompt('Body', a.body || ''); if (body === null) return null;
  return { title, body };
}

export function renderAnnouncementComposer({ onCreate, authorEmail }) {
  const box = document.createElement('div');
  box.style.background = '#f1f5f9';
  box.style.padding = '0.75rem';
  box.style.borderRadius = '8px';
  const t = document.createElement('input'); t.placeholder = 'Announcement title'; t.style.width = '100%'; t.style.marginBottom = '.5rem'; t.style.padding = '.5rem'; t.style.border = '1px solid #e5e7eb'; t.style.borderRadius='6px';
  const b = document.createElement('textarea'); b.placeholder='Write announcement...'; b.style.width='100%'; b.style.minHeight='80px'; b.style.padding='.5rem'; b.style.border='1px solid #e5e7eb'; b.style.borderRadius='6px';
  const btn = document.createElement('button'); btn.className='btn btn-primary'; btn.textContent='Post'; btn.style.marginTop='.5rem';
  btn.onclick = async () => { const title = t.value.trim(); const body = b.value.trim(); if (!title || !body) return alert('Title and body required'); await onCreate({ title, body, authorEmail }); t.value=''; b.value=''; };
  box.append(t, b, btn);
  return box;
}

export default { listAnnouncements, addAnnouncement, updateAnnouncement, deleteAnnouncement, renderAnnouncements, renderAnnouncementComposer };
