/**
 * 文字回饋：畫面中央的大字提示，以及左上角的戰況訊息。
 */
const $ = (id) => document.getElementById(id);

/** 提示自動隱藏的時間點（performance.now() 的時間軸）。 */
let toastUntil = 0;

function showAnnounce(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  toastUntil = performance.now() + 3400;
}
function showFeed(text) {
  const d = document.createElement("div");
  d.textContent = text;
  $("feed").prepend(d);
  while ($("feed").children.length > 4) $("feed").lastChild.remove();
  setTimeout(() => d.remove(), 8000);
}

/** 每幀呼叫，時間到就把提示收起來。 */
export function tickToast() {
  if (performance.now() > toastUntil) $("toast").classList.remove("show");
}

/** 換局時清空戰況訊息。 */
export function clearFeed() {
  $("feed").innerHTML = "";
}

export { showAnnounce, showFeed };
