const firebaseConfig = {
  apiKey: "AIzaSyBZ-scUMip_z6OuJ7A40lgh1YJaGdVDe88",
  authDomain: "gallinero-dea35.firebaseapp.com",
  projectId: "gallinero-dea35",
  storageBucket: "gallinero-dea35.firebasestorage.app",
  messagingSenderId: "1087577113366",
  appId: "1:1087577113366:web:b5b77ab5ff34121aca4637"
};

const Cloud = (() => {
  let db = null;
  let docRef = null;
  let ready = false;

  async function init() {
    if (!window.firebase) return false;
    try {
      firebase.initializeApp(firebaseConfig);
      await firebase.auth().signInAnonymously();
      db = firebase.firestore();
      docRef = db.collection('gallines').doc('data');
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
  return { init, pull, push, listen, isReady: () => ready };
})();
