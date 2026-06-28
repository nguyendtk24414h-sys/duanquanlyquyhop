// Helpers module exposed on window.helpers
(function(){
  function normalizeAddress(addr) {
    if (!addr) return "";
    return addr.toLowerCase().trim();
  }

  function compressImage(base64Str, maxWidth = 300, maxHeight = 300, quality = 0.7) {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height *= maxWidth / width));
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width *= maxHeight / height));
            height = maxHeight;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => {
        resolve(base64Str);
      };
    });
  }

  async function fileToGenerativePart(file) {
    const base64EncodedDataPromise = new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: {
        data: await base64EncodedDataPromise,
        mimeType: file.type
      }
    };
  }

  window.helpers = {
    normalizeAddress,
    compressImage,
    fileToGenerativePart
  };

  // Export top-level helpers for backward compatibility with inline code
  window.normalizeAddress = normalizeAddress;
  window.compressImage = compressImage;
  window.fileToGenerativePart = fileToGenerativePart;
})();
