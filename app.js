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
function handleBgFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  if (file.type.startsWith("video/")) {
    const v = document.createElement("video");
    v.src = url;
    v.muted = true;
    v.loop = state.loopBg;
    v.playsInline = true;
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
  const cw = canvas.width,
    ch = canvas.height;

  // Håll bakgrundsvideon igång och looprad under uppspelning/inspelning.
  // På iOS är 'loop'-attributet och 'ended'-eventet opålitliga när videon ritas
  // till en canvas som spelas in – därför loopar vi proaktivt via currentTime.
  if (state.bg.type === "video" && state.bg.el) {
    const v = state.bg.el;
    const active = state.recording || (previewSource && !state.paused);
    if (active && v.readyState >= 2) {
      if (
        state.loopBg &&
        v.duration &&
        isFinite(v.duration) &&
        v.currentTime >= v.duration - 0.08
      ) {
        // Spola tillbaka strax före slutet så videon aldrig stannar på en
        // frusen sista bild (vilket fryser hela inspelningen på iOS).
        try {
          v.currentTime = 0;
        } catch (e) {}
      }
      if (v.paused) v.play().catch(() => {});
    }
  }

  // Tidsberäkning för animeringar
  const playing = state.playStartTime !== null && state.segments.length > 0;
  let elapsed = 0;
  if (playing) elapsed = audioCtx.currentTime - state.playStartTime;

  // Rörelse-progress (0..1). Under uppspelning följer den hela klippets längd,
  // annars loopar den långsamt så förhandsvisningen ändå rör sig.
  let motionT;
  if (playing && state.audioDuration > 0) {
    motionT = Math.max(0, Math.min(1, elapsed / state.audioDuration));
  } else {
    motionT = ((performance.now() / 1000) % 24) / 24;
  }

  if (state.bg.type === "video" && state.bg.el.readyState >= 2) {
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

  // Uppdatera aktuellt segment utifrån uppspelningstiden
  let segElapsed = null;
  if (playing) {
    let idx = 0;
    for (let i = 0; i < state.startTimes.length; i++) {
      if (elapsed >= state.startTimes[i]) idx = i;
    }
    state.currentIndex = idx;
    segElapsed = elapsed - state.startTimes[idx];

    // Visa inspelningsförlopp i procent
    if (state.recording && state.audioDuration > 0) {
      setProgress((elapsed / state.audioDuration) * 100);
    }
  }

  if (state.segments.length) drawVerse(computeTextAnim(segElapsed));
  drawWatermark();

  // Anti-freeze: rita en nästan osynlig 2×2-pixel som ändras varje ruta. Det
  // håller canvasen "smutsig" så mobil auto-sampling (iOS) aldrig tror att
  // bilden är oförändrad och slutar fånga rutor när bakgrundsvideon tar slut.
  if (state.recording) {
    frameTick = (frameTick + 1) % 256;
    ctx.fillStyle = `rgb(${frameTick},${(frameTick * 7) % 256},${(frameTick * 13) % 256})`;
    ctx.fillRect(0, 0, 2, 2);
  }
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

function startRecording() {
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

// Kan enheten dela videofiler nativt (iOS/Android → spara till Foton/Filer)?
function canShareVideoFiles() {
  try {
    const probe = new File([new Blob([new Uint8Array(1)])], "probe.mp4", {
      type: "video/mp4",
    });
    return !!(navigator.canShare && navigator.canShare({ files: [probe] }));
  } catch (_) {
    return false;
  }
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
  if (!ffmpeg) {
    const { FFmpeg } = await import(
      "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js"
    );
    const b = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    ffmpeg = new FFmpeg();
    // Uppdatera procentmätaren medan omkodningen pågår
    ffmpeg.on("progress", ({ progress }) => {
      if (typeof progress === "number") setProgress(progress * 100);
    });
    // Ladda även worker-skriptet som blob-URL. Annars misslyckas `new Worker()`
    // när skriptet ligger på ett annat origin (unpkg) än sidan.
    await ffmpeg.load({
      classWorkerURL: await cachedBlobURL(
        "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js",
        "text/javascript"
      ),
      coreURL: await cachedBlobURL(`${b}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await cachedBlobURL(`${b}/ffmpeg-core.wasm`, "application/wasm"),
    });
  }
  const input = new Uint8Array(await inputBlob.arrayBuffer());
  await ffmpeg.writeFile(inputName, input);

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
  await ffmpeg.exec(args);
  const data = await ffmpeg.readFile("out.mp4");
  return new Blob([data.buffer], { type: "video/mp4" });
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
