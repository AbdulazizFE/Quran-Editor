// Quran Video Studio
// - Text & översättning: alquran.cloud (gratis, öppet, CORS-vänligt JSON-API)
// - Recitation (ljud): everyayah.com (CORS-vänligt, kan bäddas in i videon)
// Allt komponeras på en <canvas> och exporteras som MP4 direkt i webbläsaren.

const API = "https://api.alquran.cloud/v1";
const ARABIC_EDITION = "quran-uthmani";
const AUDIO_BASE = "https://everyayah.com/data";

// Verifierade imamer (mappnamn hos everyayah.com)
const RECITERS = [
  { folder: "Alafasy_128kbps", name: "Mishary Rashid Alafasy — مشاري العفاسي" },
  { folder: "Abdul_Basit_Murattal_192kbps", name: "Abdul Basit (Murattal) — عبد الباسط" },
  { folder: "Abdul_Basit_Mujawwad_128kbps", name: "Abdul Basit (Mujawwad) — عبد الباسط (مجود)" },
  { folder: "Abdurrahmaan_As-Sudais_192kbps", name: "Abdurrahman As-Sudais — السديس" },
  { folder: "Saood_ash-Shuraym_128kbps", name: "Saud Al-Shuraim — سعود الشريم" },
  { folder: "Husary_128kbps", name: "Mahmoud Al-Husary — الحصري" },
  { folder: "Husary_128kbps_Mujawwad", name: "Al-Husary (Mujawwad) — الحصري (مجود)" },
  { folder: "Minshawy_Murattal_128kbps", name: "El-Minshawi (Murattal) — المنشاوي" },
  { folder: "Minshawy_Mujawwad_192kbps", name: "El-Minshawi (Mujawwad) — المنشاوي (مجود)" },
  { folder: "MaherAlMuaiqly128kbps", name: "Maher Al Muaiqly — ماهر المعيقلي" },
  { folder: "Ghamadi_40kbps", name: "Saad Al-Ghamdi — سعد الغامدي" },
  { folder: "Abdullaah_3awwaad_Al-Juhaynee_128kbps", name: "Abdullah Al-Juhani — الجهني" },
  { folder: "Yasser_Ad-Dussary_128kbps", name: "Yasser Al-Dossari — ياسر الدوسري" },
  { folder: "Nasser_Alqatami_128kbps", name: "Nasser Al-Qatami — ناصر القطامي" },
  { folder: "Hani_Rifai_192kbps", name: "Hani Ar-Rifai — هاني الرفاعي" },
  { folder: "Muhammad_Ayyoub_128kbps", name: "Muhammad Ayyoub — محمد أيوب" },
  { folder: "Hudhaify_128kbps", name: "Ali Al-Hudhaify — الحذيفي" },
  { folder: "Abdullah_Basfar_192kbps", name: "Abdullah Basfar — عبد الله بصفر" },
  { folder: "Abu_Bakr_Ash-Shaatree_128kbps", name: "Abu Bakr Ash-Shaatree — الشاطري" },
  { folder: "Fares_Abbad_64kbps", name: "Fares Abbad — فارس عباد" },
  { folder: "Mohammad_al_Tablaway_128kbps", name: "Mohammad Al-Tablawy — الطبلاوي" },
  { folder: "Ibrahim_Akhdar_32kbps", name: "Ibrahim Al-Akhdar — إبراهيم الأخضر" },
  { folder: "Ali_Jaber_64kbps", name: "Ali Jaber — علي جابر" },
  { folder: "mahmoud_ali_al_banna_32kbps", name: "Mahmoud Ali Al-Banna — البنا" },
  { folder: "AbdulSamad_64kbps_QuranExplorer.Com", name: "Abdul Samad — عبد الصمد" },
];

const ASPECTS = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

const state = {
  surahs: [],
  segments: [], // [{ arabic, translation, translationDir, ref, duration }]
  currentIndex: 0,
  surahName: "",
  rangeRef: "",
  combinedBuffer: null,
  startTimes: [], // kumulativa starttider per segment
  playStartTime: null, // audioCtx.currentTime när uppspelning började (annars null)
  audioDuration: 0,
  recording: false, // pågår inspelning just nu?
  paused: false, // är förhandsvisningen pausad?
  bg: { type: "gradient", el: null },
  tint: 0.4,
  aspect: "9:16",
  watermark: "@Quran - قران",
  watermarkPos: "bottom-right",
  textAnim: "fade",
  bgMotion: "none",
  fontScale: 1,
  loopBg: true,
};

// ---- DOM ----
const $ = (id) => document.getElementById(id);
const surahSel = $("surah");
const ayahFromSel = $("ayahFrom");
const ayahToSel = $("ayahTo");
const reciterSel = $("reciter");
const translationSel = $("translation");
const aspectSel = $("aspect");
const tintRange = $("tint");
const bgFile = $("bgFile");
const loadBtn = $("loadVerse");
const clearBgBtn = $("clearBg");
const watermarkInput = $("watermark");
const watermarkPosSel = $("watermarkPos");
const textAnimSel = $("textAnim");
const bgMotionSel = $("bgMotion");
const fontScaleRange = $("fontScale");
const loopBgChk = $("loopBg");
const playBtn = $("play");
const recordBtn = $("record");
const downloadLink = $("download");
const statusEl = $("status");
const progressEl = $("progress");
const progressBar = $("progressBar");
const progressPct = $("progressPct");
const progressLabel = $("progressLabel");
const canvas = $("preview");
const ctx = canvas.getContext("2d");

// ---- Ljud (Web Audio) ----
let audioCtx = null;
let audioDest = null; // MediaStreamAudioDestinationNode (för inspelning)
let previewSource = null; // aktiv uppspelningskälla
let recorder = null;
let recordedChunks = [];
let recordVideoTrack = null; // CanvasCaptureMediaStreamTrack (manuell frame-push)
let recordTimer = null; // jämn render-/fångst-timer under inspelning
let frameTick = 0; // räknare för "anti-freeze"-pixeln under inspelning
let exporting = false; // pågår en deterministisk export just nu?
let exportReady = null; // { url, filename, file, canShare } efter en export

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioDest = audioCtx.createMediaStreamDestination();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// ---- Hjälp ----
const pad3 = (n) => String(n).padStart(3, "0");

function setStatus(msg, type = "") {
  statusEl.className = "status" + (type ? " " + type : "");
  statusEl.innerHTML = msg;
}

// ---- Export-/inspelningsprogress ----
function showProgress(label) {
  progressLabel.textContent = label || "";
  progressEl.hidden = false;
}
function hideProgress() {
  progressEl.hidden = true;
  progressEl.classList.remove("indeterminate");
  setProgress(0);
}
// pct = 0..100, eller null för obestämd (rörlig) mätare
function setProgress(pct) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) {
    progressEl.classList.add("indeterminate");
    progressPct.textContent = "…";
    return;
  }
  progressEl.classList.remove("indeterminate");
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  progressBar.style.width = p + "%";
  progressPct.textContent = p + "%";
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Nätverksfel: " + res.status);
  const data = await res.json();
  if (data.code !== 200) throw new Error(data.status || "API-fel");
  return data.data;
}

// ---- Init ----
async function init() {
  applyAspect();
  state.watermark = watermarkInput.value;
  state.watermarkPos = watermarkPosSel.value;
  state.textAnim = textAnimSel.value;
  state.bgMotion = bgMotionSel.value;
  state.fontScale = fontScaleRange.value / 100;
  state.loopBg = loopBgChk.checked;
  requestAnimationFrame(renderLoop);

  reciterSel.innerHTML = RECITERS.map(
    (r, i) => `<option value="${i}">${r.name}</option>`
  ).join("");

  try {
    setStatus("جارٍ تحميل السور…");
    const surahs = await getJSON(`${API}/surah`);
    state.surahs = surahs;
    surahSel.innerHTML = surahs
      .map(
        (s) =>
          `<option value="${s.number}">${s.number}. ${s.englishName} — ${s.name}</option>`
      )
      .join("");
    populateAyahOptions();
    setStatus("تم! اختر آية ثم اضغط على <b>جلب الآية</b>.", "ok");
  } catch (err) {
    setStatus("تعذّر تحميل السور: " + err.message, "err");
  }
}

function populateAyahOptions() {
  const surah = state.surahs.find((s) => s.number == surahSel.value);
  if (!surah) return;
  let opts = "";
  for (let i = 1; i <= surah.numberOfAyahs; i++) {
    opts += `<option value="${i}">الآية ${i}</option>`;
  }
  ayahFromSel.innerHTML = opts;
  ayahToSel.innerHTML = opts;
  ayahFromSel.value = "1";
  ayahToSel.value = "1";
}

// Håll "till"-versen >= "från"-versen
function syncAyahRange(changed) {
  const from = Number(ayahFromSel.value);
  const to = Number(ayahToSel.value);
  if (changed === "from" && to < from) ayahToSel.value = String(from);
  if (changed === "to" && to < from) ayahFromSel.value = String(to);
}

// ---- Hämta vers(er) ----
async function loadVerse() {
  const surahNo = Number(surahSel.value);
  let fromNo = Number(ayahFromSel.value);
  let toNo = Number(ayahToSel.value);
  if (toNo < fromNo) [fromNo, toNo] = [toNo, fromNo];

  const reciter = RECITERS[Number(reciterSel.value)];
  const translation = translationSel.value;
  const surah = state.surahs.find((s) => s.number === surahNo);

  const editions = [ARABIC_EDITION];
  if (translation) editions.push(translation);

  try {
    loadBtn.disabled = true;
    playBtn.disabled = true;
    recordBtn.disabled = true;
    downloadLink.hidden = true;
    resetExportButton();
    stopPreview();

    const count = toNo - fromNo + 1;
    const acx = getAudioCtx();
    const segments = [];
    const buffers = [];

    for (let ayahNo = fromNo; ayahNo <= toNo; ayahNo++) {
      setStatus(`جارٍ جلب الآية ${ayahNo} من ${toNo}…`);
      const ref = `${surahNo}:${ayahNo}`;

      // Text + översättning
      const data = await getJSON(
        `${API}/ayah/${ref}/editions/${editions.join(",")}`
      );
      const arabic = data.find((d) => d.edition.identifier === ARABIC_EDITION);
      const trans = translation
        ? data.find((d) => d.edition.identifier === translation)
        : null;

      // Recitation (ljud) – hämtas som data och avkodas så det kan bäddas in
      const audioUrl = `${AUDIO_BASE}/${reciter.folder}/${pad3(surahNo)}${pad3(
        ayahNo
      )}.mp3`;
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok)
        throw new Error("الصوت غير متوفر للآية " + ayahNo + " (" + audioRes.status + ")");
      const arrBuf = await audioRes.arrayBuffer();
      const buffer = await acx.decodeAudioData(arrBuf);

      segments.push({
        arabic: arabic ? arabic.text : "",
        translation: trans ? trans.text : "",
        translationDir:
          trans && trans.edition.direction === "rtl" ? "rtl" : "ltr",
        ref,
        duration: buffer.duration,
      });
      buffers.push(buffer);
    }

    // Bygg starttider (kumulativt) och en sammanfogad ljudbuffert
    const startTimes = [];
    let acc = 0;
    for (const b of buffers) {
      startTimes.push(acc);
      acc += b.duration;
    }

    state.segments = segments;
    state.currentIndex = 0;
    state.surahName = surah ? surah.englishName : "";
    state.rangeRef =
      count === 1 ? `${surahNo}:${fromNo}` : `${surahNo}:${fromNo}-${toNo}`;
    state.combinedBuffer = concatBuffers(acx, buffers);
    state.startTimes = startTimes;
    state.audioDuration = acc;
    state.playStartTime = null;

    playBtn.disabled = false;
    recordBtn.disabled = false;
    const label = count === 1 ? "آية واحدة" : `${count} آيات`;
    setStatus(
      `تم: <b>${state.surahName} ${state.rangeRef}</b> (${label}، ${state.audioDuration.toFixed(
        1
      )} ث). اضغط ▶ للاستماع أو ⬇ للتصدير.`,
      "ok"
    );
  } catch (err) {
    setStatus("تعذّر جلب الآية: " + err.message, "err");
  } finally {
    loadBtn.disabled = false;
  }
}

// Slå ihop flera ljudbuffertar till en enda (gapless)
function concatBuffers(acx, buffers) {
  if (buffers.length === 1) return buffers[0];
  const channels = Math.max(...buffers.map((b) => b.numberOfChannels));
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
  const out = acx.createBuffer(channels, totalLength, acx.sampleRate);
  for (let ch = 0; ch < channels; ch++) {
    const outData = out.getChannelData(ch);
    let offset = 0;
    for (const b of buffers) {
      const src = b.getChannelData(Math.min(ch, b.numberOfChannels - 1));
      outData.set(src, offset);
      offset += b.length;
    }
  }
  return out;
}

// ---- Bakgrund ----
function removeBgVideoEl() {
  if (state.bg.type === "video" && state.bg.el && state.bg.el.parentNode) {
    state.bg.el.parentNode.removeChild(state.bg.el);
  }
}

function handleBgFile(file) {
  if (!file) return;
  removeBgVideoEl();
  const url = URL.createObjectURL(file);
  if (file.type.startsWith("video/")) {
    const v = document.createElement("video");
    v.src = url;
    v.muted = true;
    v.defaultMuted = true;
    v.loop = state.loopBg;
    v.playsInline = true;
    // iOS-attribut (måste sättas även som HTML-attribut, inte bara properties)
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.preload = "auto";
    // iOS kräver att videon finns i DOM:en (och inte är display:none) för att
    // spela och gå att rita till en <canvas>. Lägg den utanför skärmen.
    v.style.cssText =
      "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;";
    document.body.appendChild(v);
    // Manuell loop som reserv: på iOS avfyras inte alltid loop-attributet när
    // videon ritas till en canvas som spelas in. Spola då tillbaka och spela igen.
    v.addEventListener("ended", () => {
      if (state.loopBg) {
        try {
          v.currentTime = 0;
          v.play();
        } catch (e) {}
      }
    });
    v.load();
    // Vänta med att spela – videon startas automatiskt när uppspelning/inspelning
    // börjar och pausas när versen är klar.
    v.pause();
    state.bg = { type: "video", el: v };
  } else {
    const img = new Image();
    img.onload = () => (state.bg = { type: "image", el: img });
    img.src = url;
  }
}

// Starta bakgrundsvideon från början (loopar tills versen är klar)
function startBgVideo() {
  if (state.bg.type === "video" && state.bg.el) {
    try {
      state.bg.el.currentTime = 0;
      state.bg.el.loop = state.loopBg;
      state.bg.el.play();
    } catch (e) {}
  }
}

// Pausa bakgrundsvideon (när versen/uppspelningen är klar)
function stopBgVideo() {
  if (state.bg.type === "video" && state.bg.el) {
    try {
      state.bg.el.pause();
    } catch (e) {}
  }
}

// Fortsätt spela bakgrundsvideon utan att spola tillbaka (vid återupptagning)
function resumeBgVideo() {
  if (state.bg.type === "video" && state.bg.el) {
    try {
      state.bg.el.play();
    } catch (e) {}
  }
}

function clearBg() {
  stopBgVideo();
  removeBgVideoEl();
  state.bg = { type: "gradient", el: null };
  bgFile.value = "";
}

// ---- Canvas ----
function applyAspect() {
  const a = ASPECTS[state.aspect];
  canvas.width = a.w;
  canvas.height = a.h;
}

function drawCover(el, ew, eh, motionT) {
  const cw = canvas.width,
    ch = canvas.height;

  // Ken Burns-rörelse: långsam zoom/panorering för mer levande bakgrund
  let zoom = 1,
    dx = 0,
    dy = 0;
  const t = typeof motionT === "number" ? motionT : 0;
  switch (state.bgMotion) {
    case "zoom-in":
      zoom = 1 + 0.14 * t;
      break;
    case "zoom-out":
      zoom = 1.14 - 0.14 * t;
      break;
    case "pan-lr":
      zoom = 1.14;
      dx = (t - 0.5) * cw * 0.14;
      break;
    case "pan-ud":
      zoom = 1.14;
      dy = (t - 0.5) * ch * 0.14;
      break;
  }

  const scale = Math.max(cw / ew, ch / eh) * zoom;
  const w = ew * scale,
    h = eh * scale;
  ctx.drawImage(el, (cw - w) / 2 + dx, (ch - h) / 2 + dy, w, h);
}

function wrapText(text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function renderLoop() {
  // Under inspelning sköter en jämn timer renderingen (oberoende av rAF som
  // mobila webbläsare stryper). Undvik då dubbelrendering här.
  if (!recordTimer) renderFrame();
  requestAnimationFrame(renderLoop);
}

function renderFrame() {
  // Bakgrundsvideo: under inspelning styrs positionen deterministiskt från
  // ljudklockan (tid % längd) så videon aldrig "tar slut" och fryser fångsten
  // på iOS. Under förhandsvisning spelas den mjukt med loop.
  if (state.bg.type === "video" && state.bg.el) {
    const v = state.bg.el;
    if (
      state.recording &&
      state.playStartTime !== null &&
      v.duration &&
      isFinite(v.duration) &&
      v.duration > 0
    ) {
      const el = audioCtx.currentTime - state.playStartTime;
      const vt = state.loopBg
        ? el % v.duration
        : Math.min(el, v.duration - 0.05);
      try {
        if (!v.paused) v.pause();
        v.currentTime = vt;
      } catch (e) {}
    } else if (previewSource && !state.paused) {
      const dur = v.duration;
      if (
        state.loopBg &&
        dur &&
        isFinite(dur) &&
        dur > 0 &&
        (v.ended || v.currentTime >= dur - 0.15)
      ) {
        try {
          v.currentTime = 0;
        } catch (e) {}
      }
      if (v.paused && v.readyState >= 1) {
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
      }
    }
  }

  const playing = state.playStartTime !== null && state.segments.length > 0;
  const elapsed = playing ? audioCtx.currentTime - state.playStartTime : null;
  drawCompositeAt(elapsed);

  if (playing && state.recording && state.audioDuration > 0) {
    setProgress((elapsed / state.audioDuration) * 100);
  }

  // Anti-freeze: rita en nästan osynlig 2×2-pixel som ändras varje ruta så mobil
  // auto-sampling (iOS) aldrig tror att bilden är oförändrad under inspelning.
  if (state.recording) {
    frameTick = (frameTick + 1) % 256;
    ctx.fillStyle = `rgb(${frameTick},${(frameTick * 7) % 256},${(frameTick * 13) % 256})`;
    ctx.fillRect(0, 0, 2, 2);
  }
}

// Ritar en komplett bildruta för en given tid i sekunder (elapsed=null → stillbild).
// Bakgrundsvideon ritas i sitt aktuella läge (live: spelas; export: sökt av anroparen).
function drawCompositeAt(elapsed) {
  const cw = canvas.width,
    ch = canvas.height;
  const playing = elapsed !== null && state.segments.length > 0;

  // Rörelse-progress (0..1)
  let motionT;
  if (playing && state.audioDuration > 0) {
    motionT = Math.max(0, Math.min(1, elapsed / state.audioDuration));
  } else {
    motionT = ((performance.now() / 1000) % 24) / 24;
  }

  if (state.bg.type === "video" && state.bg.el && state.bg.el.readyState >= 2) {
    drawCover(state.bg.el, state.bg.el.videoWidth, state.bg.el.videoHeight, motionT);
  } else if (state.bg.type === "image") {
    drawCover(state.bg.el, state.bg.el.naturalWidth, state.bg.el.naturalHeight, motionT);
  } else {
    const g = ctx.createLinearGradient(0, 0, cw, ch);
    g.addColorStop(0, "#0e1b3a");
    g.addColorStop(1, "#08322c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
  }

  ctx.fillStyle = `rgba(0,0,0,${state.tint})`;
  ctx.fillRect(0, 0, cw, ch);

  // Aktuellt segment utifrån tiden
  let segElapsed = null;
  if (playing) {
    let idx = 0;
    for (let i = 0; i < state.startTimes.length; i++) {
      if (elapsed >= state.startTimes[i]) idx = i;
    }
    state.currentIndex = idx;
    segElapsed = elapsed - state.startTimes[idx];
  }

  if (state.segments.length) drawVerse(computeTextAnim(segElapsed));
  drawWatermark();
}

// Beräkna text-animeringens tillstånd (opacitet, förskjutning, skala, oskärpa)
// baserat på hur länge det aktuella segmentet har visats.
function computeTextAnim(segElapsed) {
  const type = state.textAnim;
  if (type === "none" || segElapsed === null) {
    return { opacity: 1, offsetY: 0, scale: 1, blur: 0 };
  }
  const dur = 0.6; // animeringens längd i sekunder
  const raw = Math.max(0, Math.min(1, segElapsed / dur));
  const e = 1 - Math.pow(1 - raw, 3); // ease-out cubic
  switch (type) {
    case "slide-up":
      return { opacity: e, offsetY: (1 - e) * canvas.height * 0.06, scale: 1, blur: 0 };
    case "zoom-in":
      return { opacity: e, offsetY: 0, scale: 0.82 + 0.18 * e, blur: 0 };
    case "blur-in":
      return { opacity: e, offsetY: 0, scale: 1, blur: (1 - e) * 18 };
    case "fade":
    default:
      return { opacity: e, offsetY: 0, scale: 1, blur: 0 };
  }
}

function drawVerse(anim) {
  const seg = state.segments[state.currentIndex];
  if (!seg) return;
  anim = anim || { opacity: 1, offsetY: 0, scale: 1, blur: 0 };
  const cw = canvas.width,
    ch = canvas.height;
  const maxW = cw * 0.86;
  const fs = state.fontScale;

  ctx.save();

  // Animering: opacitet, oskärpa och skala/förskjutning kring mitten
  ctx.globalAlpha = anim.opacity;
  if (anim.blur > 0 && "filter" in ctx) ctx.filter = `blur(${anim.blur}px)`;
  if (anim.scale !== 1 || anim.offsetY !== 0) {
    ctx.translate(cw / 2, ch / 2 + anim.offsetY);
    ctx.scale(anim.scale, anim.scale);
    ctx.translate(-cw / 2, -ch / 2);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const arSize = Math.round(cw * 0.062 * fs);
  const arLineH = arSize * 1.7;
  ctx.font = `700 ${arSize}px "Amiri", "Scheherazade New", serif`;
  ctx.direction = "rtl";
  const arLines = wrapText(seg.arabic, maxW);

  const trText = seg.translation;
  const trSize = Math.round(cw * 0.03 * fs);
  const trLineH = trSize * 1.5;
  let trLines = [];
  if (trText) {
    ctx.font = `500 ${trSize}px "Inter", sans-serif`;
    trLines = wrapText(trText, maxW);
  }

  const gap = trText ? cw * 0.05 : 0;
  const refH = cw * 0.05;
  const totalH =
    arLines.length * arLineH + gap + trLines.length * trLineH + refH;
  let y = (ch - totalH) / 2 + arSize;

  ctx.font = `700 ${arSize}px "Amiri", "Scheherazade New", serif`;
  ctx.direction = "rtl";
  ctx.shadowColor = "rgba(0,0,0,.75)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffffff";
  for (const line of arLines) {
    ctx.fillText(line, cw / 2, y);
    y += arLineH;
  }

  if (trText) {
    y += gap;
    ctx.font = `500 ${trSize}px "Inter", sans-serif`;
    ctx.direction = seg.translationDir;
    ctx.fillStyle = "rgba(255,255,255,.92)";
    for (const line of trLines) {
      ctx.fillText(line, cw / 2, y);
      y += trLineH;
    }
  }

  ctx.shadowBlur = 6;
  ctx.direction = "ltr";
  ctx.font = `600 ${Math.round(cw * 0.026 * fs)}px "Inter", sans-serif`;
  ctx.fillStyle = "#9fd0ff";
  ctx.fillText(`${state.surahName} · ${seg.ref}`, cw / 2, y + refH * 0.6);
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawWatermark() {
  const text = (state.watermark || "").trim();
  if (!text) return;
  const cw = canvas.width,
    ch = canvas.height;
  const size = Math.round(cw * 0.028);
  const margin = Math.round(cw * 0.04);
  const pos = state.watermarkPos;

  ctx.font = `700 ${size}px "Amiri", "Inter", sans-serif`;
  ctx.direction = "ltr";
  ctx.textBaseline = pos.startsWith("top") ? "top" : "alphabetic";
  ctx.textAlign = pos.endsWith("left")
    ? "left"
    : pos.endsWith("center")
    ? "center"
    : "right";

  let x, y;
  if (ctx.textAlign === "left") x = margin;
  else if (ctx.textAlign === "center") x = cw / 2;
  else x = cw - margin;
  y = pos.startsWith("top") ? margin : ch - margin;

  ctx.shadowColor = "rgba(0,0,0,.7)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

// ---- Uppspelning (förhandslyssning) ----
function stopPreview() {
  if (previewSource) {
    try {
      previewSource.onended = null;
      previewSource.stop();
    } catch (e) {}
    previewSource = null;
  }
  stopBgVideo();
  state.playStartTime = null;
  state.currentIndex = 0;
  state.paused = false;
  setPlayButton("idle");
}

// Knapptext för spela/pausa-knappen
function setPlayButton(mode) {
  if (mode === "playing") playBtn.textContent = "⏸ إيقاف مؤقت";
  else if (mode === "paused") playBtn.textContent = "▶ متابعة";
  else playBtn.textContent = "▶ تشغيل";
}

// Spela / pausa förhandsvisningen med samma knapp
function togglePlayPause() {
  if (!state.combinedBuffer) return;
  if (!previewSource) {
    playPreview();
    return;
  }
  if (state.paused) {
    if (audioCtx) audioCtx.resume();
    resumeBgVideo();
    state.paused = false;
    setPlayButton("playing");
  } else {
    if (audioCtx) audioCtx.suspend();
    stopBgVideo();
    state.paused = true;
    setPlayButton("paused");
  }
}

function playPreview() {
  if (!state.combinedBuffer) return;
  stopPreview();
  const acx = getAudioCtx();
  const src = acx.createBufferSource();
  src.buffer = state.combinedBuffer;
  src.connect(acx.destination);
  src.onended = () => {
    previewSource = null;
    state.playStartTime = null;
    state.currentIndex = 0;
    state.paused = false;
    stopBgVideo();
    setPlayButton("idle");
  };
  startBgVideo();
  src.start();
  state.playStartTime = acx.currentTime;
  state.currentIndex = 0;
  state.paused = false;
  previewSource = src;
  setPlayButton("playing");
}

// ---- Inspelning & export ----
function pickMimeType() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const c of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

// Exportmetod: bakgrundsvideo → deterministisk WebCodecs-rendering (loopar utan
// frysning) och ljudet läggs på med ffmpeg. Annat (gradient/bild) → realtid.
function startRecording() {
  if (!state.combinedBuffer) return;
  if (state.bg.type === "video" && state.bg.el) {
    exportWithBackgroundVideo();
  } else {
    startRealtimeRecording();
  }
}

function startRealtimeRecording() {
  if (!state.combinedBuffer) return;
  stopPreview();

  const acx = getAudioCtx();
  const mimeType = pickMimeType();
  const isMp4 = mimeType.startsWith("video/mp4");

  // Använd manuell frame-styrning (captureStream(0) + requestFrame) på dator –
  // det är exakt och pålitligt. På mobil (särskilt iOS) är manuell frame-push
  // opålitlig; där används auto-sampling (30 fps) tillsammans med "anti-freeze"-
  // pixeln och den sömlösa videoloopen som håller bildflödet igång.
  let videoStream, vTrack;
  if (isMobile()) {
    videoStream = canvas.captureStream(30);
    vTrack = videoStream.getVideoTracks()[0];
    recordVideoTrack = null;
  } else {
    videoStream = canvas.captureStream(0);
    vTrack = videoStream.getVideoTracks()[0];
    if (!vTrack || typeof vTrack.requestFrame !== "function") {
      videoStream = canvas.captureStream(30);
      vTrack = videoStream.getVideoTracks()[0];
      recordVideoTrack = null;
    } else {
      recordVideoTrack = vTrack;
    }
  }
  const combined = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  recordedChunks = [];
  try {
    recorder = new MediaRecorder(combined, mimeType ? { mimeType } : undefined);
  } catch (err) {
    setStatus("التسجيل غير مدعوم في هذا المتصفح: " + err.message, "err");
    return;
  }
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  recorder.onstop = () => finishRecording(mimeType, isMp4);

  // Spela recitationen till både högtalare och inspelningen
  const src = acx.createBufferSource();
  src.buffer = state.combinedBuffer;
  src.connect(acx.destination);
  src.connect(audioDest);
  previewSource = src;

  startBgVideo();
  recorder.start();
  src.start();
  state.playStartTime = acx.currentTime;
  state.currentIndex = 0;
  state.recording = true;
  src.onended = () => stopRecording();

  // Rita och fånga rutor med en jämn timer (~30 fps). Varje ruta renderas färskt
  // från ljudklockan, så texten följer imamen och animeringar/loop spelas in
  // korrekt även om requestAnimationFrame stryps på mobilen.
  if (recordTimer) clearInterval(recordTimer);
  recordTimer = setInterval(() => {
    renderFrame();
    if (recordVideoTrack && recordVideoTrack.requestFrame) {
      recordVideoTrack.requestFrame();
    }
  }, 1000 / 30);

  recordBtn.classList.remove("success");
  recordBtn.classList.add("recording");
  recordBtn.textContent = "■ إيقاف التصدير";
  recordBtn.dataset.mode = "";
  playBtn.disabled = true;
  downloadLink.hidden = true;
  showProgress("جارٍ التسجيل…");
  setProgress(0);
  setStatus("جارٍ التسجيل… سيتوقف الفيديو تلقائيًا عند انتهاء الآيات.", "");
}

function stopRecording() {
  if (recordTimer) {
    clearInterval(recordTimer);
    recordTimer = null;
  }
  recordVideoTrack = null;
  if (recorder && recorder.state !== "inactive") recorder.stop();
  stopPreview();
  state.recording = false;
  recordBtn.classList.remove("recording");
  playBtn.disabled = false;
}

function isIOS() {
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) // iPadOS / desktop-läge
  );
}

function isMobile() {
  return (
    isIOS() ||
    /Android|Mobile|Silk|BlackBerry|Opera Mini|IEMobile/i.test(
      navigator.userAgent
    ) ||
    // Touch-enhet utan mus (fallback när UA maskeras)
    (navigator.maxTouchPoints > 1 &&
      window.matchMedia &&
      window.matchMedia("(pointer: coarse)").matches)
  );
}

async function finishRecording(mimeType, isMp4) {
  showProgress("جارٍ تصدير الفيديو…");
  setProgress(null);
  try {
    await exportRecording(mimeType, isMp4);
  } finally {
    hideProgress();
  }
}

async function exportRecording(mimeType, isMp4) {
  const blob = new Blob(recordedChunks, { type: mimeType || "video/webm" });
  const base = `quran-${state.rangeRef.replace(/[:]/g, "-")}`;
  const inputName = isMp4 ? "in.mp4" : "in.webm";

  // På mobil (särskilt iPhone) är ffmpeg.wasm opålitligt: worker-skript från
  // annat origin kan blockeras och minnet räcker sällan – det gör att exporten
  // fastnar eller kraschar. iOS Safari spelar redan in en spelbar MP4, så vi
  // hoppar över omkodningen och erbjuder inspelningen direkt för att spara/dela.
  if (isMobile()) {
    const ext = isMp4 ? "mp4" : "webm";
    await offerDownload(blob, `${base}.${ext}`);
    setStatus(
      "تم! اضغط على الزر لحفظ الفيديو أو مشاركته. ✅",
      "ok"
    );
    return;
  }

  // På dator: kör igenom ffmpeg. Webbläsarens råa inspelning (särskilt direkt-MP4
  // i Chrome) är en fragmenterad MP4 (moof/mfra) som TikTok/Instagram inte kan spela.
  // Är inspelningen redan H.264/AAC räcker en snabb remux (kopiera strömmarna +
  // faststart) för att få en vanlig MP4 – mycket snabbare och stabilare än full
  // omkodning. WebM (t.ex. Firefox) måste däremot kodas om helt.
  setStatus(
    "جارٍ تجهيز الفيديو… (يُحمّل مكوّن في المرة الأولى، يُرجى الانتظار) ⏳"
  );
  try {
    // مهلة زمنية حتى لا يعلق ffmpeg إلى الأبد.
    let mp4Blob;
    if (isMp4) {
      try {
        mp4Blob = await withTimeout(
          convertToMp4(blob, inputName, { remux: true }),
          60000,
          "انتهت المهلة"
        );
      } catch (remuxErr) {
        // Faller tillbaka till full omkodning om remux inte fungerar
        mp4Blob = await withTimeout(
          convertToMp4(blob, inputName),
          120000,
          "انتهت المهلة"
        );
      }
    } else {
      mp4Blob = await withTimeout(
        convertToMp4(blob, inputName),
        120000,
        "انتهت المهلة"
      );
    }
    await offerDownload(mp4Blob, `${base}.mp4`);
    setStatus(
      "تم! الفيديو (MP4) جاهز للنشر على تيك توك/إنستغرام وللتنزيل. ✅",
      "ok"
    );
  } catch (err) {
    // حل احتياطي: قدّم الملف الأصلي
    const ext = isMp4 ? "mp4" : "webm";
    await offerDownload(blob, `${base}.${ext}`);
    setStatus(
      "تعذّر تحسين الفيديو (" +
        err.message +
        "). تم تنزيل النسخة الأصلية بدلاً من ذلك – قد تحتاج إلى تحويل قبل الرفع إلى تيك توك.",
      "err"
    );
  }
}

// Kör ett löfte med en tidsgräns; avvisar om det tar för lång tid.
function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function offerDownload(blob, filename) {
  // Frigör ev. tidigare export
  if (exportReady && exportReady.url) URL.revokeObjectURL(exportReady.url);

  const url = URL.createObjectURL(blob);
  let file = null;
  let canShare = false;
  try {
    file = new File([blob], filename, { type: blob.type || "video/mp4" });
    canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  } catch (_) {
    canShare = false;
  }
  exportReady = { url, filename, file, canShare };

  // Förbered den dolda ankarlänken för desktop-nedladdning
  downloadLink.href = url;
  downloadLink.download = filename;

  // Gör om samma knapp till en nedladdnings-/dela-knapp
  recordBtn.classList.remove("recording", "accent");
  recordBtn.classList.add("success");
  recordBtn.textContent = canShare ? "⬇ حفظ / مشاركة الفيديو" : "⬇ تنزيل الفيديو";
  recordBtn.dataset.mode = "download";
}

// Ladda ner eller dela den senast exporterade videon
async function doDownload() {
  if (!exportReady) return;
  if (exportReady.canShare && exportReady.file) {
    try {
      await navigator.share({
        files: [exportReady.file],
        title: exportReady.filename,
      });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return; // användaren avbröt
      // annars: fall vidare till vanlig nedladdning
    }
  }
  if (isMobile()) {
    // iOS Safari ignorerar download-attributet → öppna i ny flik för att spara
    window.open(exportReady.url, "_blank");
  } else {
    downloadLink.href = exportReady.url;
    downloadLink.download = exportReady.filename;
    downloadLink.click();
  }
}

// Återställ export-/nedladdningsknappen till "Exportera video"
function resetExportButton() {
  recordBtn.classList.remove("recording", "success");
  recordBtn.classList.add("accent");
  recordBtn.textContent = "⬇ تصدير الفيديو";
  recordBtn.dataset.mode = "";
}

// ---- ffmpeg.wasm (omkodar inspelningen till en TikTok-vänlig MP4) ----
let ffmpeg = null;
let ffmpegProgress = (p) => setProgress(p * 100); // hur ffmpeg-progress mappas

// Hämtar en fil och cachar den i webbläsarens Cache Storage så ffmpeg-komponenterna
// (≈30 MB) bara laddas ner en gång och återanvänds i kommande sessioner. Returnerar
// en blob-URL (krävs för att köra worker/wasm från ett annat origin än sidan).
async function cachedBlobURL(url, mimeType) {
  let response = null;
  try {
    const cache = await caches.open("ffmpeg-core-v1");
    response = await cache.match(url);
    if (!response) {
      const fetched = await fetch(url);
      if (fetched.ok) {
        await cache.put(url, fetched.clone());
        response = fetched;
      }
    }
  } catch (_) {
    // Cache Storage ej tillgängligt (t.ex. privat läge) – hämta direkt nedan
    response = null;
  }
  if (!response) response = await fetch(url);
  const buf = await response.arrayBuffer();
  return URL.createObjectURL(new Blob([buf], { type: mimeType }));
}

async function convertToMp4(inputBlob, inputName = "in.webm", { remux = false } = {}) {
  ffmpegProgress = (p) => setProgress(p * 100);
  const ff = await ensureFfmpeg();
  const input = new Uint8Array(await inputBlob.arrayBuffer());
  await ff.writeFile(inputName, input);

  // Remux: kopiera strömmarna utan omkodning (snabbt, minnessnålt). Fixar
  // fragmenterad MP4 från iOS -> normal MP4 med moov-atomen först (faststart).
  const args = remux
    ? [
        "-i", inputName,
        "-c", "copy",
        "-movflags", "+faststart",
        "out.mp4",
      ]
    : [
        "-i", inputName,
        // Video: H.264, jämna dimensioner, standard pixelformat, konstant 30 fps
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-profile:v", "main",
        "-level", "4.0",
        "-pix_fmt", "yuv420p",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30",
        "-r", "30",
        // Ljud: AAC 44.1 kHz stereo
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "44100",
        "-ac", "2",
        // Lägg moov-atomen först så plattformar kan strömma/validera direkt
        "-movflags", "+faststart",
        "out.mp4",
      ];
  await ff.exec(args);
  const data = await ff.readFile("out.mp4");
  return new Blob([data.buffer], { type: "video/mp4" });
}

// Laddar (och cachar) ffmpeg-instansen en gång.
async function ensureFfmpeg() {
  if (ffmpeg) return ffmpeg;
  const { FFmpeg } = await import(
    "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js"
  );
  const b = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
  const ff = new FFmpeg();
  ff.on("progress", ({ progress }) => {
    if (typeof progress === "number") ffmpegProgress(progress);
  });
  // Ladda även worker-skriptet som blob-URL. Annars misslyckas `new Worker()`
  // när skriptet ligger på ett annat origin (unpkg) än sidan.
  await ff.load({
    classWorkerURL: await cachedBlobURL(
      "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js",
      "text/javascript"
    ),
    coreURL: await cachedBlobURL(`${b}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await cachedBlobURL(`${b}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpeg = ff;
  return ffmpeg;
}

// ---- Deterministisk export (bild-för-bild) ----
// Används när bakgrunden är en video: varje ruta renderas för en exakt tid och
// videon söks till (tid % videolängd) → perfekt loop som aldrig fryser. Detta
// är oberoende av realtidsinspelning (som är opålitlig med video på iOS).

// Sök en video till en given tid och vänta tills bilden är klar.
function seekVideo(v, time) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      v.removeEventListener("seeked", finish);
      resolve();
    };
    v.addEventListener("seeked", finish);
    try {
      v.currentTime = time;
    } catch (e) {
      finish();
    }
    // Säkerhetsutlösning om 'seeked' inte kommer
    setTimeout(finish, 400);
  });
}

// Fånga aktuell canvas som JPEG-bytes.
function canvasToJpeg(quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("toBlob misslyckades"));
        blob.arrayBuffer().then((ab) => resolve(new Uint8Array(ab)), reject);
      },
      "image/jpeg",
      quality
    );
  });
}

// Konvertera en AudioBuffer till en 16-bitars PCM WAV (Uint8Array).
function audioBufferToWav(buffer) {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const blockAlign = numCh * 2;
  const dataSize = numFrames * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  let p = 0;
  const wStr = (s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i));
  };
  const wU32 = (v) => {
    view.setUint32(p, v, true);
    p += 4;
  };
  const wU16 = (v) => {
    view.setUint16(p, v, true);
    p += 2;
  };
  wStr("RIFF");
  wU32(36 + dataSize);
  wStr("WAVE");
  wStr("fmt ");
  wU32(16);
  wU16(1);
  wU16(numCh);
  wU32(sampleRate);
  wU32(sampleRate * blockAlign);
  wU16(blockAlign);
  wU16(16);
  wStr("data");
  wU32(dataSize);
  const chans = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      p += 2;
    }
  }
  return new Uint8Array(ab);
}

// Väljer en H.264-profil som enheten faktiskt stödjer för given storlek.
async function pickAvcCodec(width, height, fps) {
  const candidates = [
    "avc1.640028",
    "avc1.4d0028",
    "avc1.42e028",
    "avc1.640020",
    "avc1.42001f",
  ];
  for (const codec of candidates) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: 6_000_000,
        framerate: fps,
      });
      if (res && res.supported) return codec;
    } catch (e) {}
  }
  return null;
}

async function webCodecsSupported() {
  if (typeof VideoEncoder === "undefined") return false;
  const codec = await pickAvcCodec(canvas.width, canvas.height, 30);
  return !!codec;
}

// Reserv: rendera rutor och koda med ffmpeg.wasm (JPEG-sekvens + WAV → MP4).
async function renderAndEncodeFfmpeg(fps) {
  const dur = state.audioDuration;
  const totalFrames = Math.max(1, Math.round(dur * fps));
  const bgVideo = state.bg.type === "video" ? state.bg.el : null;
  if (bgVideo) {
    try {
      bgVideo.pause();
    } catch (e) {}
  }

  // Ladda ffmpeg med tidsgräns – om det inte går faller vi tillbaka till realtid.
  const ff = await withTimeout(ensureFfmpeg(), 90000, "تعذّر تحميل مكوّن الفيديو");

  // 1) Rendera + skriv varje ruta som JPEG (0..65 % av mätaren)
  const pad = (n) => String(n).padStart(5, "0");
  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;
    if (bgVideo && bgVideo.duration && isFinite(bgVideo.duration)) {
      const vt = state.loopBg
        ? t % bgVideo.duration
        : Math.min(t, bgVideo.duration - 0.05);
      await seekVideo(bgVideo, vt);
    }
    drawCompositeAt(t);
    const jpg = await canvasToJpeg(0.82);
    await ff.writeFile(`f${pad(i)}.jpg`, jpg);
    setProgress((i / totalFrames) * 65);
    setStatus(
      `جارٍ رسم الإطارات… ${Math.round((i / totalFrames) * 100)}%`,
      ""
    );
  }

  // 2) Ljud → WAV
  const wav = audioBufferToWav(state.combinedBuffer);
  await ff.writeFile("audio.wav", wav);
  setProgress(68);
  setStatus("جارٍ ترميز الفيديو… ⏳", "");

  // 3) Koda video (JPEG-sekvens) + ljud → MP4 (68..100 %)
  ffmpegProgress = (pr) => setProgress(68 + pr * 32);
  await ff.exec([
    "-framerate", String(fps),
    "-i", "f%05d.jpg",
    "-i", "audio.wav",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-pix_fmt", "yuv420p",
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-r", String(fps),
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "44100",
    "-ac", "2",
    "-shortest",
    "-movflags", "+faststart",
    "out.mp4",
  ]);
  const data = await ff.readFile("out.mp4");

  // 4) Städa MEMFS för att frigöra minne
  for (let i = 0; i < totalFrames; i++) {
    try {
      await ff.deleteFile(`f${pad(i)}.jpg`);
    } catch (e) {}
  }
  try {
    await ff.deleteFile("audio.wav");
    await ff.deleteFile("out.mp4");
  } catch (e) {}

  return new Blob([data.buffer], { type: "video/mp4" });
}

// Bygg AudioSpecificConfig-bytes för AAC-LC (mp4a.40.2) utifrån frekvens/kanaler.
// Krävs av mp4-muxer för att skriva en giltig esds-atom kring de färdiga AAC-ramarna.
function makeAacAsc(sampleRate, channels) {
  const rates = [
    96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000,
    11025, 8000, 7350,
  ];
  let idx = rates.indexOf(sampleRate);
  if (idx < 0) idx = 4; // fallback 44100
  const objType = 2; // AAC LC
  const ch = Math.max(1, Math.min(7, channels || 2));
  const b0 = (objType << 3) | (idx >> 1);
  const b1 = ((idx & 1) << 7) | (ch << 3);
  return new Uint8Array([b0, b1]);
}

// Extrahera färdigkodade AAC-ramar ur en (ev. fragmenterad) MP4-inspelning med
// mp4box.js. Ger { codec, sampleRate, channels, description, chunks:[{data,type,
// timestamp,duration}] } så vi kan muxa in ljudet utan att koda om (och utan ffmpeg).
async function demuxAudio(blob, mime) {
  if (!/audio\/mp4|video\/mp4/i.test(mime || "")) {
    // Endast MP4/AAC stöds här (iOS ger detta). Annat (webm/opus) → reservväg.
    throw new Error("ljudformatet stöds inte för demux");
  }
  const mod = await import("https://cdn.jsdelivr.net/npm/mp4box@0.5.2/+esm");
  const MP4Box = mod.default || mod.MP4Box || mod;
  const file = MP4Box.createFile();
  const chunks = [];

  const meta = await new Promise((resolve, reject) => {
    file.onError = (e) => reject(new Error("mp4box: " + e));
    file.onReady = (info) => {
      const at =
        (info.audioTracks && info.audioTracks[0]) ||
        (info.tracks || []).find((t) => t.type === "audio" || t.audio);
      if (!at) {
        reject(new Error("لا يوجد مسار صوت"));
        return;
      }
      const m = {
        id: at.id,
        sampleRate: (at.audio && at.audio.sample_rate) || 44100,
        channels:
          (at.audio && at.audio.channel_count) ||
          state.combinedBuffer.numberOfChannels ||
          2,
        codec: /opus/i.test(at.codec) ? "opus" : "aac",
      };
      file.setExtractionOptions(at.id, null, { nbSamples: 1000000 });
      file.start();
      resolve(m);
    };

    file.onSamples = (id, user, samps) => {
      for (const s of samps) {
        chunks.push({
          data: s.data,
          type: s.is_sync ? "key" : "delta",
          timestamp: Math.round((s.cts / s.timescale) * 1e6),
          duration: Math.round((s.duration / s.timescale) * 1e6),
        });
      }
    };

    blob
      .arrayBuffer()
      .then((ab) => {
        ab.fileStart = 0;
        file.appendBuffer(ab);
        file.flush();
      })
      .catch(reject);
  });

  if (!chunks.length) throw new Error("لم يُستخرج أي صوت");
  meta.description =
    meta.codec === "aac" ? makeAacAsc(meta.sampleRate, meta.channels) : undefined;
  meta.chunks = chunks;
  return meta;
}

// Snabb export med bakgrundsvideo – i realtid, utan frysning och utan ffmpeg.
// - VIDEON kodas med WebCodecs genom att ta ögonblicksbilder av canvasen varje
//   ruta. Till skillnad från canvas.captureStream (som fryser på iOS när
//   bakgrundsvideon loopar) fryser WebCodecs-fångst ALDRIG, och det finns ingen
//   långsam bild-för-bild-sökning → exporten tar ungefär lika lång tid som klippet.
// - LJUDET spelas in parallellt med MediaRecorder över en kombinerad ström
//   (video + ljud). Det är den enda metoden som garanterat ger hörbart ljud på
//   iOS. Endast ljudspåret demuxas ut och muxas ihop med WebCodecs-videon.
async function exportRealtimeWebCodecs(fps) {
  const acx = getAudioCtx();
  if (acx.state === "suspended") await acx.resume();
  const width = canvas.width;
  const height = canvas.height;
  const totalDur = state.audioDuration;

  const vcodec = await pickAvcCodec(width, height, fps);
  if (!vcodec) throw new Error("ingen H.264-profil stöds");

  // --- Ljudinspelning: kombinerad ström så iOS faktiskt tar med ljudet ---
  const carrier = canvas.captureStream(fps); // bärvågsvideo, kasseras (endast ljudet används)
  const recStream = new MediaStream([
    ...carrier.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);
  const recMime = pickMimeType();
  let audioRec;
  try {
    audioRec = new MediaRecorder(
      recStream,
      recMime ? { mimeType: recMime } : undefined
    );
  } catch (e) {
    throw new Error("ljudinspelning stöds inte");
  }
  const recChunks = [];
  audioRec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recChunks.push(e.data);
  };
  const audioBlobReady = new Promise((resolve, reject) => {
    audioRec.onstop = () =>
      resolve(new Blob(recChunks, { type: recMime || "video/mp4" }));
    audioRec.onerror = (e) =>
      reject((e && e.error) || new Error("ljudinspelning misslyckades"));
  });

  // --- WebCodecs-videokodare: chunks buffras och muxas efter demux av ljudet ---
  const frameDur = Math.round(1e6 / fps);
  const videoChunks = [];
  let videoDecoderConfig = null;
  let encodeError = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta && meta.decoderConfig && !videoDecoderConfig)
        videoDecoderConfig = meta.decoderConfig;
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      videoChunks.push({
        data,
        type: chunk.type,
        timestamp: chunk.timestamp,
        duration: chunk.duration || frameDur,
      });
    },
    error: (e) => (encodeError = e),
  });
  videoEncoder.configure({
    codec: vcodec,
    width,
    height,
    bitrate: isMobile() ? 5_000_000 : 8_000_000,
    framerate: fps,
  });

  // --- Starta ljud + spela bakgrundsvideon (loop via uppspelning, ingen sökning) ---
  const bgVideo = state.bg.type === "video" ? state.bg.el : null;
  const src = acx.createBufferSource();
  src.buffer = state.combinedBuffer;
  src.connect(audioDest);

  if (bgVideo) {
    try {
      bgVideo.loop = true;
      bgVideo.currentTime = 0;
      const p = bgVideo.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }

  const gopSize = Math.max(1, Math.round(fps * 2));
  let frameIndex = 0;
  let finished = false;
  let timer = null;
  const startT = acx.currentTime;

  audioRec.start();
  src.start();

  await new Promise((resolve) => {
    src.onended = resolve;
    timer = setInterval(() => {
      if (finished) return;
      const elapsed = acx.currentTime - startT;
      if (encodeError || elapsed >= totalDur) {
        resolve();
        return;
      }
      // Håll bakgrundsvideon rullande och loopande (drivs av uppspelning).
      if (bgVideo) {
        if (
          bgVideo.ended ||
          (bgVideo.duration &&
            isFinite(bgVideo.duration) &&
            bgVideo.currentTime >= bgVideo.duration - 0.05)
        ) {
          if (state.loopBg) {
            try {
              bgVideo.currentTime = 0;
            } catch (e) {}
          }
        }
        if (bgVideo.paused && bgVideo.readyState >= 2) {
          const p = bgVideo.play();
          if (p && p.catch) p.catch(() => {});
        }
      }
      drawCompositeAt(elapsed);
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(elapsed * 1e6),
        duration: frameDur,
      });
      try {
        videoEncoder.encode(frame, { keyFrame: frameIndex % gopSize === 0 });
      } catch (e) {
        encodeError = e;
      }
      frame.close();
      frameIndex++;
      setProgress(Math.min(80, (elapsed / totalDur) * 80));
      setStatus(`جارٍ الإنشاء… ${Math.round((elapsed / totalDur) * 100)}%`, "");
    }, 1000 / fps);
  });

  finished = true;
  if (timer) clearInterval(timer);
  try {
    src.stop();
  } catch (e) {}
  try {
    audioRec.stop();
  } catch (e) {}
  if (bgVideo) {
    try {
      bgVideo.pause();
    } catch (e) {}
  }

  await videoEncoder.flush();
  videoEncoder.close();
  if (encodeError) throw encodeError;
  if (!videoChunks.length) throw new Error("ingen videokodning");

  // --- Demuxa ljudet och muxa ihop med videon (ingen omkodning, inget ffmpeg) ---
  setProgress(85);
  setStatus("جارٍ دمج الصوت… ⏳", "");
  const audioBlob = await audioBlobReady;
  const audio = await demuxAudio(audioBlob, recMime || audioBlob.type);

  const { Muxer, ArrayBufferTarget } = await import(
    "https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/+esm"
  );
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height },
    audio: {
      codec: audio.codec,
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.channels,
    },
    fastStart: "in-memory",
  });

  for (let i = 0; i < videoChunks.length; i++) {
    const c = videoChunks[i];
    muxer.addVideoChunkRaw(
      c.data,
      c.type,
      c.timestamp,
      c.duration,
      i === 0 ? { decoderConfig: videoDecoderConfig } : undefined
    );
  }
  for (let i = 0; i < audio.chunks.length; i++) {
    const c = audio.chunks[i];
    muxer.addAudioChunkRaw(
      c.data,
      c.type,
      c.timestamp,
      c.duration,
      i === 0
        ? {
            decoderConfig: {
              codec: audio.codec === "aac" ? "mp4a.40.2" : "opus",
              sampleRate: audio.sampleRate,
              numberOfChannels: audio.channels,
              description: audio.description,
            },
          }
        : undefined
    );
  }

  setProgress(98);
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}

// Export med bakgrundsvideo: snabb realtidsrendering med WebCodecs (ingen frysning,
// perfekt loop) + inspelat ljud. Faller tillbaka till ffmpeg (äldre webbläsare
// utan WebCodecs) och till sist till vanlig realtidsinspelning.
async function exportWithBackgroundVideo() {
  if (!state.combinedBuffer) return;
  exporting = true;
  stopPreview();
  const base = `quran-${state.rangeRef.replace(/[:]/g, "-")}`;
  const fps = isMobile() ? 24 : 25;

  recordBtn.classList.remove("success", "accent");
  recordBtn.classList.add("recording");
  recordBtn.textContent = "■ جارٍ الإنشاء…";
  recordBtn.dataset.mode = "";
  playBtn.disabled = true;
  downloadLink.hidden = true;
  showProgress("جارٍ إنشاء الفيديو…");
  setProgress(0);
  setStatus(
    "جارٍ إنشاء الفيديو (خلفية متكررة بلا تجميد + صوت)… ⏳",
    ""
  );

  try {
    const blob = (await webCodecsSupported())
      ? await exportRealtimeWebCodecs(fps)
      : await renderAndEncodeFfmpeg(fps);
    hideProgress();
    recordBtn.classList.remove("recording");
    playBtn.disabled = false;
    exporting = false;
    await offerDownload(blob, `${base}.mp4`);
    setStatus(
      "تم! الخلفية تتكرر، النص يتبع التلاوة، والصوت مضمّن. جاهز للنشر ✅",
      "ok"
    );
  } catch (err) {
    // Reserv: fall tillbaka till vanlig realtidsinspelning (ljud funkar säkert)
    hideProgress();
    recordBtn.classList.remove("recording");
    playBtn.disabled = false;
    exporting = false;
    setStatus(
      "تعذّرت المعالجة الدقيقة (" +
        err.message +
        ") – يتم التسجيل بالطريقة العادية…",
      ""
    );
    startRealtimeRecording();
  }
}

// ---- Events ----
surahSel.addEventListener("change", populateAyahOptions);
ayahFromSel.addEventListener("change", () => syncAyahRange("from"));
ayahToSel.addEventListener("change", () => syncAyahRange("to"));
loadBtn.addEventListener("click", loadVerse);
bgFile.addEventListener("change", (e) => handleBgFile(e.target.files[0]));
clearBgBtn.addEventListener("click", clearBg);
aspectSel.addEventListener("change", () => {
  state.aspect = aspectSel.value;
  applyAspect();
});
tintRange.addEventListener("input", () => (state.tint = tintRange.value / 100));
watermarkInput.addEventListener("input", () => (state.watermark = watermarkInput.value));
watermarkPosSel.addEventListener("change", () => (state.watermarkPos = watermarkPosSel.value));
textAnimSel.addEventListener("change", () => (state.textAnim = textAnimSel.value));
bgMotionSel.addEventListener("change", () => (state.bgMotion = bgMotionSel.value));
fontScaleRange.addEventListener("input", () => (state.fontScale = fontScaleRange.value / 100));
loopBgChk.addEventListener("change", () => {
  state.loopBg = loopBgChk.checked;
  if (state.bg.type === "video" && state.bg.el) state.bg.el.loop = state.loopBg;
});
playBtn.addEventListener("click", togglePlayPause);
recordBtn.addEventListener("click", () => {
  if (exporting) return; // deterministisk export pågår – ignorera klick
  if (recorder && recorder.state === "recording") {
    stopRecording();
  } else if (recordBtn.dataset.mode === "download") {
    doDownload();
  } else {
    startRecording();
  }
});

if (document.fonts && document.fonts.load) {
  document.fonts.load('700 60px "Amiri"');
}

init();
