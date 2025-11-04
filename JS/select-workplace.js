// Workplace selection and DB routing helpers
import { getDBForWorkplace, getStorageForWorkplace, WORKPLACE_IDS } from '../firebase/config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

export let selectedWorkplace = null;
export let db = null;
export let storage = null;

export function useWorkplace(id) {
  if (!WORKPLACE_IDS.includes(id)) throw new Error(`Unknown workplace id: ${id}`);
  selectedWorkplace = id;
  db = getDBForWorkplace(id);
  storage = getStorageForWorkplace(id);
}

export function clearWorkplace() {
  selectedWorkplace = null;
  db = null; storage = null;
}

// Example loader to verify connection
export async function pingWorkplace() {
  if (!db) throw new Error('No workplace selected');
  try {
    // Try listing a small collection (workers) if exists
    const snap = await getDocs(collection(db, 'workers'));
    return { ok: true, count: snap.size };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
