/**
 * 文字回饋：畫面中央的大字提示，以及左上角的戰況訊息。
 */
const $ = (id: string) => document.getElementById(id)!;

/** 提示自動隱藏的時間點（performance.now() 的時間軸）。 */
let toastUntil = 0;

function showAnnounce(text: string) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  toastUntil = performance.now() + 3400;
}
function showFeed(text: string) {
  const line = document.createElement("div");
  line.textContent = text;
  const feed = $("feed");
  feed.prepend(line);
  // 只留最新的四則，其餘立刻移除；留下的八秒後自行淡出。
  while (feed.children.length > 4) feed.lastElementChild?.remove();
  setTimeout(() => line.remove(), 8000);
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
