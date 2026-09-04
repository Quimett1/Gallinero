const firebaseConfig = {
  apiKey: "AIzaSyBZ-scUMip_z6OuJ7A40lgh1YJaGdVDe88",
  authDomain: "gallinero-dea35.firebaseapp.com",
  projectId: "gallinero-dea35",
  storageBucket: "gallinero-dea35.firebasestorage.app",
  messagingSenderId: "1087577113366",
  appId: "1:1087577113366:web:b5b77ab5ff34121aca4637"
};
const PIN_KEY = 'gallines-pin';

const Cloud = (() => {
  let db = null;
  let docRef = null;
  let ready = false;

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function getPin() { return localStorage.getItem(PIN_KEY) || ''; }
  function hasPin() { return Boolean(getPin()); }
  async function setPin(pin) {
    localStorage.setItem(PIN_KEY, pin);
    return init();
  }
  function clearPin() { localStorage.removeItem(PIN_KEY); ready = false; }

  async function init() {
    if (!window.firebase) return false;
    const pin = getPin();
    if (!pin) { ready = false; return false; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      await firebase.auth().signInAnonymously();
      db = firebase.firestore();
      const docId = await sha256Hex(pin);
      docRef = db.collection('gallines').doc(docId);
      const snap = await docRef.get();
      if (!snap.exists) {
        const legacyRef = db.collection('gallines').doc('data');
        const legacy = await legacyRef.get();
        if (legacy.exists) { await docRef.set(legacy.data()); await legacyRef.delete(); }
      }
      ready = true;
      return true;
    } catch {
      ready = false;
      return false;
    }
  }
  async function pull() {
    if (!ready) return null;
    try {
      const snap = await docRef.get();
      return snap.exists ? snap.data() : null;
    } catch { return null; }
  }
  function push(data) {
    if (!ready) return;
    docRef.set({ ...data, updatedAt: Date.now() }).catch(() => {});
  }
  function listen(callback) {
    if (!ready) return () => {};
    return docRef.onSnapshot(snap => {
      if (snap.exists && !snap.metadata.hasPendingWrites) callback(snap.data());
    }, () => {});
  }
  return { init, pull, push, listen, isReady: () => ready, getPin, hasPin, setPin, clearPin };
})();
