// Firebase helpers module — exposes functions on window for the main UI script
(function(){
  const appId = typeof window.__app_id !== 'undefined' ? window.__app_id : 'school-dao-transparent-v1';
  let firebaseApp, db, auth;
  let cloudSyncReady = false;
  let cloudSyncError = null;

  // Cloud state
  let firestoreCampaign = null;
  let firestorePaidMembers = [];
  let firestoreMints = [];
  let firestoreSharedVote = null;
  let firestoreTxs = { executed: {}, created: {}, approved: {} };

  function getPendingMints() {
    return firestoreMints;
  }

  function updateCloudSyncStatus(ready, error) {
    cloudSyncReady = !!ready;
    cloudSyncError = error || null;
    try {
      const statusEl = document.getElementById('cloudSyncStatus');
      if (statusEl) {
        if (cloudSyncReady) {
          statusEl.textContent = '☁️ Đang đồng bộ với Cloud';
          statusEl.className = 'text-xs font-semibold text-emerald-600';
        } else {
          statusEl.textContent = cloudSyncError ? '⚠️ Đồng bộ Cloud chưa sẵn sàng' : '📝 Đang dùng dữ liệu cục bộ';
          statusEl.className = 'text-xs font-semibold text-amber-600';
        }
      }
      const bannerEl = document.getElementById('cloudSyncBanner');
      if (bannerEl) {
        bannerEl.classList.toggle('hidden', cloudSyncReady);
      }
    } catch (e) {}
  }

  async function savePendingMints(mints) {
    firestoreMints = mints;
    try { localStorage.setItem(`${appId}_mints`, JSON.stringify(mints)); } catch(e) {}
    try {
      const user = await ensureFirebaseReady();
      if (user && db) {
        await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('mints').doc('main').set({ items: mints });
        updateCloudSyncStatus(true, null);
      }
    } catch(e) {
      updateCloudSyncStatus(false, e);
      console.error('Lỗi đồng bộ danh sách đúc lên Firestore:', e);
      if (typeof window.showCustomAlert === 'function') window.showCustomAlert('error','Lỗi Cloud Database','Không thể đồng bộ danh sách đúc lên Firebase.');
    }
    if (typeof window.syncBlockchainData === 'function') window.syncBlockchainData();
  }

  function getActiveCampaign() { return firestoreCampaign; }
  function getPaidMembers() { return firestorePaidMembers; }

  async function saveCampaign(campaign, paidMembers) {
    if (campaign && !Array.isArray(campaign.voteHolders)) campaign.voteHolders = [];
    if (campaign && Array.isArray(paidMembers)) campaign.voteHolders = paidMembers;
    if (campaign && campaign.completed && !campaign.completedAt) campaign.completedAt = new Date().toLocaleString('vi-VN');
    firestoreCampaign = campaign;
    firestorePaidMembers = paidMembers || [];
    try {
      localStorage.setItem(`${appId}_campaign`, JSON.stringify(campaign));
      localStorage.setItem(`${appId}_paidMembers`, JSON.stringify(firestorePaidMembers));
    } catch(e) {}
    try {
      const user = await ensureFirebaseReady();
      if (user && db) {
        await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('campaign').doc('main').set({
          campaign: campaign,
          paidMembers: paidMembers,
          activeVote: firestoreSharedVote,
          transactions: firestoreTxs
        }, { merge: true });
        updateCloudSyncStatus(true, null);
      }
    } catch(e) {
      cloudSyncReady = false;
      cloudSyncError = e;
      console.error('Lỗi đồng bộ chiến dịch lên Firestore:', e);
      if (typeof window.showCustomAlert === 'function') window.showCustomAlert('error', 'Lỗi Cloud Database', 'Không thể đồng bộ chiến dịch lên Firebase. Xem console để biết chi tiết.');
    }
    if (typeof window.syncBlockchainData === 'function') window.syncBlockchainData();
  }

  async function saveSharedVote(vote) {
    firestoreSharedVote = vote;
    try {
      if (vote === null) {
        localStorage.removeItem(`${appId}_sharedVote`);
      } else {
        localStorage.setItem(`${appId}_sharedVote`, JSON.stringify(vote));
      }
    } catch(e) {}
    try {
      const user = await ensureFirebaseReady();
      if (user && db) {
        await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('campaign').doc('main').set({ activeVote: vote }, { merge: true });
        updateCloudSyncStatus(true, null);
        console.log('Đồng bộ biểu quyết Snapshot và mã băm IPFS CID lên Cloud Firestore thành công!');
      }
    } catch(e) {
      cloudSyncReady = false;
      cloudSyncError = e;
      console.error('LỖI GHI CLOUD FIRESTORE MỤC VOTE:', e);
      if (typeof window.showCustomAlert === 'function') window.showCustomAlert('error', 'Lỗi Cloud Database', 'Không thể đồng bộ trạng thái biểu quyết lên Firebase.');
    }
    if (typeof window.syncBlockchainData === 'function') window.syncBlockchainData();
  }

  async function saveTxsToFirestore(created, approved, executed) {
    const txs = { created: created || firestoreTxs.created, approved: approved || firestoreTxs.approved, executed: executed || firestoreTxs.executed };
    firestoreTxs = txs;
    try { localStorage.setItem(`${appId}_txs`, JSON.stringify(txs)); } catch(e) {}
    try {
      const user = await ensureFirebaseReady();
      if (user && db) {
        await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('campaign').doc('main').set({ transactions: txs }, { merge: true });
        updateCloudSyncStatus(true, null);
        console.log('Đồng bộ mã hash giao dịch lên Cloud Firestore thành công!');
      }
    } catch(e) {
      cloudSyncReady = false;
      cloudSyncError = e;
      console.error('LỖI GHI CLOUD FIRESTORE MỤC TRANSACTIONS:', e);
      if (typeof window.showCustomAlert === 'function') window.showCustomAlert('error','Lỗi Cloud Database','Không thể đồng bộ giao dịch lên Firebase.');
    }
  }

  function loadLocalFallbacks() {
    try {
      const localCampaign = localStorage.getItem(`${appId}_campaign`);
      if (localCampaign) firestoreCampaign = JSON.parse(localCampaign);
      const localPaid = localStorage.getItem(`${appId}_paidMembers`);
      if (localPaid) firestorePaidMembers = JSON.parse(localPaid);
      if (firestoreCampaign && firestoreCampaign.completed && !Array.isArray(firestoreCampaign.voteHolders)) {
        firestoreCampaign.voteHolders = firestorePaidMembers || [];
      }
      const localMints = localStorage.getItem(`${appId}_mints`);
      if (localMints) firestoreMints = JSON.parse(localMints);
      const localVote = localStorage.getItem(`${appId}_sharedVote`);
      if (localVote) firestoreSharedVote = JSON.parse(localVote);
      const localTxs = localStorage.getItem(`${appId}_txs`);
      if (localTxs) firestoreTxs = JSON.parse(localTxs);
    } catch(e) { console.warn('Lỗi nạp LocalStorage Fallbacks:', e); }
  }

  async function getFirebaseConfig() {
    if (window.__FIREBASE_CONFIG__) return window.__FIREBASE_CONFIG__;

    const response = await fetch('/config/firebase');
    if (!response.ok) {
      throw new Error('Không thể tải cấu hình Firebase từ server.');
    }

    const config = await response.json();
    if (!config || !config.apiKey) {
      throw new Error('Firebase config chưa được cấu hình đúng.');
    }

    window.__FIREBASE_CONFIG__ = config;
    return config;
  }

  let firebaseAuthPromise = null;
  function ensureFirebaseReady() {
    if (firebaseAuthPromise) return firebaseAuthPromise;
    firebaseAuthPromise = new Promise((resolve, reject) => {
      if (typeof window.firebase === 'undefined') { reject(new Error('Firebase SDK not loaded')); return; }
      const firebase = window.firebase;

      getFirebaseConfig().then((firebaseConfig) => {
        try {
          if (firebase.apps.length === 0) { firebaseApp = firebase.initializeApp(firebaseConfig); } else { firebaseApp = firebase.app(); }
          db = firebaseApp.firestore();
          auth = firebaseApp.auth();
          // expose db/auth for existing inline code that references them
          window.db = db;
          window.auth = auth;

          const initAuth = async () => {
            try {
              if (auth.currentUser) {
                resolve(auth.currentUser);
                return;
              }

              if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                await auth.signInWithCustomToken(__initial_auth_token);
              } else {
                await auth.signInAnonymously();
              }

              if (auth.currentUser) {
                resolve(auth.currentUser);
              } else {
                const fallbackUser = await new Promise((resolveUser) => {
                  const unsubscribe = auth.onAuthStateChanged((user) => {
                    if (user) {
                      unsubscribe();
                      resolveUser(user);
                    }
                  });
                  setTimeout(() => {
                    unsubscribe();
                    resolveUser(null);
                  }, 4000);
                });
                if (fallbackUser) {
                  resolve(fallbackUser);
                } else {
                  reject(new Error('Firebase auth did not produce a user.'));
                }
              }
            } catch(err) {
              console.warn('Auth failed, retrying anonymous:', err);
              try {
                await auth.signInAnonymously();
                if (auth.currentUser) {
                  resolve(auth.currentUser);
                } else {
                  reject(err);
                }
              } catch(e) {
                reject(e);
              }
            }
          };
          initAuth();
        } catch(e) {
          reject(e);
        }
      }).catch(reject);

        const initAuth = async () => {
          try {
            if (auth.currentUser) {
              resolve(auth.currentUser);
              return;
            }

            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
              await auth.signInWithCustomToken(__initial_auth_token);
            } else {
              await auth.signInAnonymously();
            }

            if (auth.currentUser) {
              resolve(auth.currentUser);
            } else {
              const fallbackUser = await new Promise((resolveUser) => {
                const unsubscribe = auth.onAuthStateChanged((user) => {
                  if (user) {
                    unsubscribe();
                    resolveUser(user);
                  }
                });
                setTimeout(() => {
                  unsubscribe();
                  resolveUser(null);
                }, 4000);
              });
              if (fallbackUser) {
                resolve(fallbackUser);
              } else {
                reject(new Error('Firebase auth did not produce a user.'));
              }
            }
          } catch(err) {
            console.warn('Auth failed, retrying anonymous:', err);
            try {
              await auth.signInAnonymously();
              if (auth.currentUser) {
                resolve(auth.currentUser);
              } else {
                reject(err);
              }
            } catch(e) {
              reject(e);
            }
          }
        };
        initAuth();
      } catch(e) { reject(e); }
    });
    return firebaseAuthPromise;
  }

  async function setupFirestoreListeners() {
    try {
      await ensureFirebaseReady();
      updateCloudSyncStatus(true, null);
      const campaignDoc = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('campaign').doc('main');
      const mintsDoc = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('mints').doc('main');
      campaignDoc.onSnapshot(docSnap => {
        if (docSnap.exists) {
          const data = docSnap.data();
          firestoreCampaign = data.campaign || null;
          firestorePaidMembers = data.paidMembers || [];
          firestoreSharedVote = data.activeVote || null;
          if (data.transactions) {
            firestoreTxs = { executed: data.transactions.executed || {}, created: data.transactions.created || {}, approved: data.transactions.approved || {} };
          }
          if (firestoreCampaign && firestoreCampaign.completed && !Array.isArray(firestoreCampaign.voteHolders)) {
            firestoreCampaign.voteHolders = firestorePaidMembers;
          }
          try {
            localStorage.setItem(`${appId}_campaign`, JSON.stringify(firestoreCampaign));
            localStorage.setItem(`${appId}_paidMembers`, JSON.stringify(firestorePaidMembers));
            localStorage.setItem(`${appId}_sharedVote`, JSON.stringify(firestoreSharedVote));
            localStorage.setItem(`${appId}_txs`, JSON.stringify(firestoreTxs));
          } catch(e) {}
        }
        if (typeof window.syncBlockchainData === 'function') window.syncBlockchainData();
      }, err => console.error('Lỗi đồng bộ chiến dịch đám mây:', err));

      mintsDoc.onSnapshot(docSnap => {
        if (docSnap.exists) {
          const data = docSnap.data();
          firestoreMints = data.items || [];
          try { localStorage.setItem(`${appId}_mints`, JSON.stringify(firestoreMints)); } catch(e) {}
        }
        if (typeof window.syncBlockchainData === 'function') window.syncBlockchainData();
      }, err => console.error('Lỗi đồng bộ danh sách đúc đám mây:', err));

      if (typeof window.setupChatListener === 'function') window.setupChatListener();
    } catch(e) {
      updateCloudSyncStatus(false, e);
      console.error('Lỗi thiết lập listeners đám mây:', e);
    }
  }

  async function bootstrapSharedSync() {
    try {
      loadLocalFallbacks();
      await ensureFirebaseReady();
      await setupFirestoreListeners();
      if (typeof window.syncBlockchainData === 'function') {
        await window.syncBlockchainData();
      }
    } catch (err) {
      updateCloudSyncStatus(false, err);
      console.error('Lỗi khởi tạo đồng bộ chung:', err);
      if (typeof window.showCustomAlert === 'function') {
        window.showCustomAlert('warning', 'Đồng bộ Cloud chưa sẵn sàng', 'Trang vẫn dùng dữ liệu cục bộ tạm thời. Hãy thử lại sau.');
      }
    }
  }

  // Expose API
  window.firebaseApi = {
    ensureFirebaseReady,
    setupFirestoreListeners,
    saveCampaign,
    saveSharedVote,
    saveTxsToFirestore,
    loadLocalFallbacks,
    getActiveCampaign,
    getPaidMembers,
    getPendingMints,
    savePendingMints
  };

  // Also set globals names used elsewhere for compatibility
  window.ensureFirebaseReady = ensureFirebaseReady;
  window.setupFirestoreListeners = setupFirestoreListeners;
  window.bootstrapSharedSync = bootstrapSharedSync;
  window.saveCampaign = saveCampaign;
  window.saveSharedVote = saveSharedVote;
  window.saveTxsToFirestore = saveTxsToFirestore;
  window.loadLocalFallbacks = loadLocalFallbacks;
  window.getActiveCampaign = getActiveCampaign;
  window.getPaidMembers = getPaidMembers;
  window.getPendingMints = getPendingMints;
  window.savePendingMints = savePendingMints;

  // Mirror internal state as global properties for backward compatibility with inline code
  Object.defineProperty(window, 'firestoreCampaign', {
    get: () => firestoreCampaign,
    set: (v) => { firestoreCampaign = v; }
  });
  Object.defineProperty(window, 'firestorePaidMembers', {
    get: () => firestorePaidMembers,
    set: (v) => { firestorePaidMembers = v; }
  });
  Object.defineProperty(window, 'firestoreMints', {
    get: () => firestoreMints,
    set: (v) => { firestoreMints = v; }
  });
  Object.defineProperty(window, 'firestoreSharedVote', {
    get: () => firestoreSharedVote,
    set: (v) => { firestoreSharedVote = v; }
  });
  Object.defineProperty(window, 'firestoreTxs', {
    get: () => firestoreTxs,
    set: (v) => { firestoreTxs = v; }
  });

  // Export appId for code that references it in the UI
  window.appId = appId;

})();
