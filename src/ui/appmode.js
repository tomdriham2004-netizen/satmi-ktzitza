// App mode on phones: a fullscreen button, landscape lock where the browser
// allows it (Android), an "add to home screen" guide where it does not
// (iPhone Safari has no fullscreen API for pages), and a "rotate your phone"
// screen while held upright.
import { IS_TOUCH } from "./touch.js";

const root = document.documentElement;
const IS_IOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => !!(navigator.standalone || window.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches);
const inFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const canFullscreen = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

const make = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

function sync() {
  root.classList.toggle('app-full', standalone() || inFullscreen());
}

async function lockLandscape() {
  try { await screen.orientation?.lock?.('landscape'); } catch { /* not allowed here */ }
}

/** Fullscreen + landscape where possible, otherwise explain how to install. */
export async function goFullscreen() {
  if (inFullscreen() || standalone()) { await lockLandscape(); return; }
  if (canFullscreen()) {
    const el = document.documentElement;
    try {
      await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen());
      await lockLandscape();
      return;
    } catch { /* fall through to the guide */ }
  }
  showInstallGuide();
}

function showInstallGuide() {
  document.getElementById('install-guide')?.remove();
  const steps = IS_IOS
    ? `<li>לוחצים על <b>•••</b> או על כפתור השיתוף <b>⬆︎</b> בדפדפן</li>
       <li>בוחרים <b>״הוספה למסך הבית״</b></li>
       <li>פותחים את <b>סתמי קציצה</b> מהאייקון החדש, והוא ייפתח במסך מלא בלי שורת הכתובת</li>`
    : `<li>פותחים את התפריט <b>⋮</b> של הדפדפן</li>
       <li>בוחרים <b>״הוספה למסך הבית״</b> או <b>״התקנת אפליקציה״</b></li>
       <li>פותחים את <b>סתמי קציצה</b> מהאייקון החדש</li>`;
  const el = make(`<div id="install-guide" class="app-sheet"><div class="app-card glass">
    <div class="app-emoji">📲</div>
    <h2>משחקים במסך מלא</h2>
    <p>${IS_IOS ? 'באייפון אפשר לקבל מסך מלא רק כשמוסיפים את המשחק למסך הבית. לוקח חמש שניות:' : 'הדפדפן הזה לא מאפשר מסך מלא ישירות, אבל אפשר להתקין את המשחק:'}</p>
    <ol>${steps}</ol>
    <button class="btn primary lg" data-close>הבנתי</button>
  </div></div>`);
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) el.remove(); });
  document.body.appendChild(el);
}

function rotateScreen() {
  const el = make(`<div id="rotate-hint" class="app-sheet"><div class="app-card">
    <div class="app-phone">📱</div>
    <h2>סובבו את הטלפון לרוחב</h2>
    <p>המשחק בנוי למסך רחב. ככה רואים את כל הלוח והכפתורים גדולים יותר.</p>
    <button class="btn primary lg" data-fs>⛶ מסך מלא</button>
    <button class="link-btn" data-stay>להמשיך לאורך בכל זאת</button>
  </div></div>`);
  el.querySelector('[data-stay]').addEventListener('click', () => {
    root.classList.add('allow-portrait');
    try { sessionStorage.setItem('allowPortrait', '1'); } catch { /* ignore */ }
  });
  document.body.appendChild(el);
}

if (IS_TOUCH) {
  try { if (sessionStorage.getItem('allowPortrait')) root.classList.add('allow-portrait'); } catch { /* ignore */ }
  sync();
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', sync);
  // any element with data-fs opens fullscreen (menubar, title screen, rotate screen)
  document.addEventListener('click', (e) => { if (e.target.closest?.('[data-fs]')) goFullscreen(); });
  if (document.body) rotateScreen(); else addEventListener('DOMContentLoaded', rotateScreen);
}
