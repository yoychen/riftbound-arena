/**
 * 音效。
 *
 * 全部是即時合成的短音，沒有音檔 —— 所以專案不需要任何資產。
 * 瀏覽器要求使用者互動後才能啟動 AudioContext，因此在進場與點擊時 resume。
 */
let audioCtx = null;
let muted = false;

export const isMuted = () => muted;

/** 切換靜音，回傳切換後的狀態。 */
export function toggleMute() {
  muted = !muted;
  if (!muted) audioCtx?.resume();
  return muted;
}

/** 在使用者互動後啟動或恢復音訊。沒有 Web Audio 的環境會靜默略過。 */
export function resumeAudio() {
  if (!audioCtx)
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
  audioCtx.resume();
}

/** 合成一個短促的下滑音。靜音或尚未啟動音訊時什麼都不做。 */
function playTone(freq, duration, volume, type) {
  if (muted || !audioCtx) return;
  const o = audioCtx.createOscillator(),
    g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(
    freq * 0.5,
    audioCtx.currentTime + duration,
  );
  g.gain.setValueAtTime(volume, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + duration);
}

export { playTone };
