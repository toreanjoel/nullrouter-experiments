// Fallback screen when WebGPU is missing or the device is lost.
function showFallback(reason) {
  document.body.classList.add('no-gpu');
  const el = document.getElementById('fallback');
  if (reason) document.getElementById('fallbackReason').textContent = reason;
  el.hidden = false;
}
