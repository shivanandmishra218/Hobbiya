// Shared avatar crop/filter editor — supports choosing a file OR taking a photo with the camera.
// Expects on the page: <input id="avatar">, <img id="avatarPreview">, a #cameraBtn button,
// the crop modal markup (#avatarModal, #cropperImage, #saveCropBtn, #cancelCropBtn, .filter-btn),
// and the camera modal markup (#cameraModal, #cameraVideo, #captureCameraBtn, #cancelCameraBtn).
// After the user saves a crop, the result is stored in window.pendingAvatarBlob
// for the page's own submit handler to upload.

window.pendingAvatarBlob = null;

(function () {
  const avatarInput = document.getElementById('avatar');
  const avatarModal = document.getElementById('avatarModal');
  const cropperImage = document.getElementById('cropperImage');
  const saveCropBtn = document.getElementById('saveCropBtn');
  const cancelCropBtn = document.getElementById('cancelCropBtn');
  const avatarPreview = document.getElementById('avatarPreview');
  const filterBtns = document.querySelectorAll('.filter-btn');

  const cameraBtn = document.getElementById('cameraBtn');
  const cameraModal = document.getElementById('cameraModal');
  const cameraVideo = document.getElementById('cameraVideo');
  const captureCameraBtn = document.getElementById('captureCameraBtn');
  const cancelCameraBtn = document.getElementById('cancelCameraBtn');

  if (!avatarInput || !avatarModal) return; // page doesn't use the editor

  let cropperInstance = null;
  let currentFilter = 'none';
  let cameraStream = null;

  // Opens the crop modal with any image source (data URL or object URL)
  function openCropModal(imageSrc) {
    cropperImage.src = imageSrc;
    avatarModal.style.display = 'flex';

    if (cropperInstance) cropperInstance.destroy();
    cropperInstance = new Cropper(cropperImage, {
      aspectRatio: 1,
      viewMode: 1,
      background: false,
      autoCropArea: 1,
    });

    currentFilter = 'none';
    cropperImage.style.filter = '';
    filterBtns.forEach(b => b.classList.remove('active'));
    const noneBtn = document.querySelector('.filter-btn[data-filter="none"]');
    if (noneBtn) noneBtn.classList.add('active');
  }

  // ===== Choose from files =====
  avatarInput.addEventListener('change', () => {
    const file = avatarInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => openCropModal(e.target.result);
    reader.readAsDataURL(file);
  });

  // ===== Take a photo with the camera =====
  if (cameraBtn && cameraModal) {
    cameraBtn.addEventListener('click', async () => {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
        });
        cameraVideo.srcObject = cameraStream;
        cameraModal.style.display = 'flex';
      } catch (err) {
        if (window.showToast) {
          showToast("Couldn't access your camera — check permissions and try again.", 'error');
        }
      }
    });

    captureCameraBtn.addEventListener('click', () => {
      const canvas = document.createElement('canvas');
      canvas.width = cameraVideo.videoWidth;
      canvas.height = cameraVideo.videoHeight;
      const ctx = canvas.getContext('2d');
      // Mirror the image so it matches what the user sees in a "selfie" preview
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      closeCameraModal();
      openCropModal(dataUrl);
    });

    cancelCameraBtn.addEventListener('click', closeCameraModal);
  }

  function closeCameraModal() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }
    cameraModal.style.display = 'none';
  }

  // ===== Filters =====
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      cropperImage.style.filter = currentFilter === 'none' ? '' : currentFilter;
    });
  });

  // ===== Save crop =====
  saveCropBtn.addEventListener('click', () => {
    if (!cropperInstance) return;

    const croppedCanvas = cropperInstance.getCroppedCanvas({ width: 500, height: 500 });
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = 500;
    finalCanvas.height = 500;
    const ctx = finalCanvas.getContext('2d');
    ctx.filter = currentFilter === 'none' ? 'none' : currentFilter;
    ctx.drawImage(croppedCanvas, 0, 0, 500, 500);

    finalCanvas.toBlob((blob) => {
      window.pendingAvatarBlob = blob;
      if (avatarPreview) {
        avatarPreview.src = URL.createObjectURL(blob);
        avatarPreview.style.display = 'block';
      }
      closeCropModal();
    }, 'image/jpeg', 0.92);
  });

  cancelCropBtn.addEventListener('click', closeCropModal);

  function closeCropModal() {
    avatarModal.style.display = 'none';
    avatarInput.value = ''; // allow re-selecting the same file later
  }
})();
