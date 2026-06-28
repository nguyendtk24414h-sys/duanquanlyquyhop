// Ethereum/web3 helpers — connection and event handlers
(function(){
  function getInjectedEthereum() {
    if (typeof window === 'undefined') return null;
    const candidates = [];
    if (window.ethereum) candidates.push(window.ethereum);
    if (window.ethereum && Array.isArray(window.ethereum.providers)) {
      candidates.push(...window.ethereum.providers);
    }
    if (window.ethereum && window.ethereum.provider) {
      candidates.push(window.ethereum.provider);
    }
    for (const candidate of candidates) {
      if (candidate && (typeof candidate.request === 'function' || typeof candidate.send === 'function' || typeof candidate.sendAsync === 'function')) {
        return candidate;
      }
    }
    return null;
  }

  async function waitForInjectedEthereum(maxAttempts = 10, intervalMs = 250) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const injected = getInjectedEthereum();
      if (injected) return injected;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return null;
  }

  async function waitForEthers(maxAttempts = 20, intervalMs = 250) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (typeof window.ethers !== 'undefined') return true;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return false;
  }

  async function callInjectedMethod(injectedEthereum, method, params) {
    if (!injectedEthereum) {
      throw new Error('MetaMask chưa được phát hiện.');
    }

    if (typeof injectedEthereum.request === 'function') {
      return injectedEthereum.request({ method, params });
    }

    if (typeof injectedEthereum.send === 'function') {
      return injectedEthereum.send(method, params || []);
    }

    if (typeof injectedEthereum.sendAsync === 'function') {
      return new Promise((resolve, reject) => {
        injectedEthereum.sendAsync({ method, params: params || [] }, (err, result) => {
          if (err) reject(err);
          else resolve(result && result.result !== undefined ? result.result : result);
        });
      });
    }

    throw new Error('MetaMask không hỗ trợ phương thức request/send.');
  }

  function setWalletUi(address, connected) {
    const walletAddress = document.getElementById('walletAddress');
    const connectBtn = document.getElementById('connectBtn');
    if (walletAddress) {
      walletAddress.innerText = connected && address ? address : 'Chưa kết nối ví';
    }
    if (connectBtn) {
      connectBtn.innerHTML = connected && address ? `🟢 ${address.substring(0, 6)}...${address.substring(38)}` : 'Kết nối ví MetaMask';
    }
  }

  async function ensureProvider({ forceWallet = false } = {}) {
    const ethersReady = await waitForEthers();
    if (!ethersReady) {
      throw new Error('Thư viện ethers chưa tải xong.');
    }

    const injectedEthereum = getInjectedEthereum();
    if (forceWallet && injectedEthereum) {
      window.provider = new window.ethers.providers.Web3Provider(injectedEthereum, 'any');
      return window.provider;
    }

    if (!window.provider) {
      if (injectedEthereum) {
        window.provider = new window.ethers.providers.Web3Provider(injectedEthereum, 'any');
      } else {
        window.provider = new window.ethers.providers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
      }
    }
    return window.provider;
  }

  async function requestWalletAccounts() {
    const injectedEthereum = getInjectedEthereum();
    if (!injectedEthereum) {
      throw new Error('MetaMask chưa được cài đặt hoặc chưa được bật.');
    }

    try {
      const accounts = await callInjectedMethod(injectedEthereum, 'eth_requestAccounts', []);
      if (!accounts || accounts.length === 0) {
        throw new Error('MetaMask chưa cấp quyền tài khoản.');
      }
      return accounts;
    } catch (error) {
      if (error && (error.code === 4001 || error.message?.includes('User rejected') || error.message?.includes('từ chối'))) {
        throw new Error('Bạn đã từ chối kết nối ví trong MetaMask.');
      }
      if (typeof injectedEthereum.enable === 'function') {
        try {
          const legacyAccounts = await injectedEthereum.enable();
          if (legacyAccounts && legacyAccounts.length > 0) return legacyAccounts;
        } catch (legacyErr) {
          console.warn('Legacy enable failed:', legacyErr);
        }
      }
      throw error;
    }
  }

  async function ensureWalletConnected({ prompt = false } = {}) {
    const provider = await ensureProvider({ forceWallet: prompt });
    const injectedEthereum = getInjectedEthereum();
    let accounts = [];

    if (prompt) {
      accounts = await requestWalletAccounts();
    } else {
      if (!injectedEthereum) {
        return false;
      }
      accounts = await callInjectedMethod(injectedEthereum, 'eth_accounts', []);
    }

    if (!accounts || accounts.length === 0) {
      if (prompt) {
        throw new Error('MetaMask chưa cấp quyền truy cập tài khoản.');
      }
      return false;
    }

    window.provider = provider;
    window.signer = provider.getSigner();
    window.userAddress = accounts[0];
    setWalletUi(window.userAddress, true);

    if (typeof window.syncBlockchainData === 'function') await window.syncBlockchainData();
    if (typeof window.initializeWeb3EventHandlers === 'function') window.initializeWeb3EventHandlers();
    if (typeof window.ensureFirebaseReady === 'function') {
      window.ensureFirebaseReady().then(() => { if (typeof window.setupFirestoreListeners === 'function') window.setupFirestoreListeners(); });
    }
    if (typeof window.blockchainSyncInterval === 'undefined') {
      window.blockchainSyncInterval = setInterval(() => { if (typeof window.syncBlockchainData === 'function') window.syncBlockchainData(); }, 18000);
    }

    return true;
  }

  async function tryAutoConnect() {
    const injectedEthereum = await waitForInjectedEthereum();
    if (!injectedEthereum) return;
    const ethersReady = await waitForEthers();
    if (!ethersReady) return;
    try {
      await ensureWalletConnected({ prompt: false });
    } catch (err) {
      console.warn('Auto connect không thành công:', err);
    }
  }

  function handleAccountsChanged(accounts) {
    const injectedEthereum = getInjectedEthereum();
    if (!accounts || accounts.length === 0) {
      window.userAddress = null;
      setWalletUi(null, false);
      if (typeof window.showCustomAlert === 'function') window.showCustomAlert('info', 'Ví MetaMask đã ngắt kết nối', 'Vui lòng kết nối lại hoặc chọn tài khoản phù hợp.');
      return;
    }
    window.userAddress = accounts[0];
    setWalletUi(window.userAddress, true);
    if (injectedEthereum) {
      window.provider = new window.ethers.providers.Web3Provider(injectedEthereum);
      window.signer = window.provider.getSigner();
    }
    if (typeof window.syncBlockchainData === 'function') window.syncBlockchainData();
  }

  function handleChainChanged(chainId) {
    const injectedEthereum = getInjectedEthereum();
    if (chainId && injectedEthereum) {
      window.provider = new window.ethers.providers.Web3Provider(injectedEthereum);
      window.signer = window.provider.getSigner();
      if (typeof window.syncBlockchainData === 'function') window.syncBlockchainData();
      if (chainId !== '0xaa36a7' && chainId !== '0xAA36A7') {
        if (typeof window.showCustomAlert === 'function') window.showCustomAlert('error', 'Sai mạng lưới', 'Vui lòng chọn Sepolia Testnet trong MetaMask để sử dụng đầy đủ chức năng.');
      }
    }
  }

  function initializeWeb3EventHandlers() {
    const injectedEthereum = getInjectedEthereum();
    if (!injectedEthereum) return;
    if (window.__walletHandlersInitialized) return;
    injectedEthereum.on('accountsChanged', handleAccountsChanged);
    injectedEthereum.on('chainChanged', handleChainChanged);
    window.__walletHandlersInitialized = true;
  }

  window.getInjectedEthereum = getInjectedEthereum;
  window.tryAutoConnect = tryAutoConnect;
  window.handleAccountsChanged = handleAccountsChanged;
  window.handleChainChanged = handleChainChanged;
  window.initializeWeb3EventHandlers = initializeWeb3EventHandlers;
  window.ensureWalletConnected = ensureWalletConnected;
  window.requestWalletAccounts = requestWalletAccounts;
})();
