// Pinata frontend helper - uses backend proxy
(function(){
  async function uploadVoteMetadata(voteData) {
    const proxyUrl = (window.PINATA_PROXY_URL || '').trim();
    const endpoints = [];

    if (proxyUrl) {
      endpoints.push(`${proxyUrl.replace(/\/$/, '')}/api/pinata/pin-json`);
    }
    endpoints.push('/api/pinata/pin-json');

    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voteData })
        });

        let responseText;
        try {
          responseText = await res.text();
        } catch (err) {
          throw new Error('Không đọc được phản hồi từ máy chủ Pinata.');
        }

        let data;
        try {
          data = JSON.parse(responseText);
        } catch (err) {
          throw new Error(`Pinata proxy trả về dữ liệu không hợp lệ (status ${res.status}): ${responseText || 'empty response'}`);
        }

        if (!res.ok) {
          const message = data.error?.message || data.error || JSON.stringify(data);
          throw new Error(message || `Pinata upload failed (status ${res.status})`);
        }

        if (!data.cid) {
          throw new Error(`Pinata upload không trả về CID: ${JSON.stringify(data)}`);
        }

        return data;
      } catch (err) {
        lastError = err;
        if (endpoint === endpoints[endpoints.length - 1]) {
          throw err;
        }
      }
    }

    throw lastError || new Error('Không thể kết nối tới proxy Pinata.');
  }

  window.pinata = { uploadVoteMetadata };
})();
