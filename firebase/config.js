// Firebase multi-app setup: 1 auth + 3 workplace databases
// Uses Firebase Web v11 modular SDK via gstatic to match existing code style

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js';

// Auth/Users project (kept as-is)
const AUTH_CONFIG = {
  apiKey: "AIzaSyAt_HJiP_uuWC7-AqMKlfLwjQFsESjB364",
  authDomain: "my-admin-dashboard-b9c89.firebaseapp.com",
  projectId: "my-admin-dashboard-b9c89",
  storageBucket: "my-admin-dashboard-b9c89.firebasestorage.app",
  messagingSenderId: "1001105953619",
  appId: "1:1001105953619:web:1e2cf52a9ff37aeb5207a6",
  measurementId: "G-DGTX5YCKYF"
};

// Workplace-specific projects
const WORKPLACE_CONFIGS = {
  esports_lounge: {
    apiKey: "AIzaSyC4GQHGbZZgzjdxdN0KD_CSyVd6uIyp3ds",
    authDomain: "esports-lounge.firebaseapp.com",
    projectId: "esports-lounge",
    storageBucket: "esports-lounge.firebasestorage.app",
    messagingSenderId: "650780952883",
    appId: "1:650780952883:web:9fabed7932e7eed08a5646"
  },
  esports_arena: {
    apiKey: "AIzaSyDuGdmgLuzZ-sw8cZysRksQxh6NB2s-8jM",
    authDomain: "esports-arena-cf8e5.firebaseapp.com",
    projectId: "esports-arena-cf8e5",
    storageBucket: "esports-arena-cf8e5.firebasestorage.app",
    messagingSenderId: "708633585253",
    appId: "1:708633585253:web:a5e81211448b8ebf44088c"
  },
  it_service_center: {
    apiKey: "AIzaSyB883-_dlzUFteVkuYFTMtPI4V8YRwdCcI",
    authDomain: "its-workplace.firebaseapp.com",
    projectId: "its-workplace",
    storageBucket: "its-workplace.firebasestorage.app",
    messagingSenderId: "975907555283",
    appId: "1:975907555283:web:437a7fc28e939d2a655126"
  }
};

// Initialize or retrieve an app by name safely
function ensureApp(name, config) {
  const existing = getApps().find(a => a.name === name);
  if (existing) return existing;
  return initializeApp(config, name);
}

// Initialize all apps once
const authApp = ensureApp('auth-app', AUTH_CONFIG);

const WORKPLACE_APPS = Object.fromEntries(
  Object.entries(WORKPLACE_CONFIGS).map(([id, cfg]) => [id, ensureApp(`workplace-${id}`, cfg)])
);

// Build map of Firestore + Storage per workplace id
const WORKPLACE_DBS = Object.fromEntries(
  Object.entries(WORKPLACE_APPS).map(([id, app]) => [id, { db: getFirestore(app), storage: getStorage(app) }])
);

// Expose to window for legacy code that expects globals
window.FB_APPS = { authApp, ...WORKPLACE_APPS };
window.WORKPLACE_DBS = WORKPLACE_DBS;
window.WORKPLACE_IDS = Object.keys(WORKPLACE_DBS);

// Helpers
export function getDBForWorkplace(id) {
  const w = WORKPLACE_DBS[id];
  if (!w) throw new Error(`Unknown workplace id: ${id}`);
  return w.db;
}

export function getStorageForWorkplace(id) {
  const w = WORKPLACE_DBS[id];
  if (!w) throw new Error(`Unknown workplace id: ${id}`);
  return w.storage;
}

export const WORKPLACE_IDS = Object.keys(WORKPLACE_DBS);
export const AUTH_APP = authApp;
