// Keys: Space pause, N nudge, T turn it over, R reset.
function initKeys(B) {
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
    switch (e.code) {
      case 'Space': e.preventDefault(); if (!e.repeat) togglePause(); break;
      case 'KeyN': actNudge(B); break;
      case 'KeyT': if (!e.repeat) actTurnOver(B, CAM.right); break;
      case 'KeyR': if (!e.repeat) actReset(B); break;
    }
  });
}
