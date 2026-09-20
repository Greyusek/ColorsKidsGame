"use strict";

/*
 * Масштабирование игры:
 * 1. Новый цвет — добавьте один объект в COLORS.
 * 2. Новая CSS-фигура — добавьте объект в ARTWORKS и clip-path в styles.css.
 * 3. PNG с замкнутыми чёрными линиями — положите файл в assets и добавьте:
 *    { type: "image", name: "Кот", src: "assets/cat.png" }
 *    Программа сама найдёт область внутри замкнутого контура и закрасит её.
 */

const ROUND_DURATION_MS = 15_000;
const ANSWER_DURATION_MS = 1_800;

const COLORS = [
  { english: "RED", russian: "красный", value: "#ef3340" },
  { english: "ORANGE", russian: "оранжевый", value: "#ff8a00" },
  { english: "YELLOW", russian: "жёлтый", value: "#ffd400" },
  { english: "GREEN", russian: "зелёный", value: "#29a745" },
  { english: "BLUE", russian: "синий", value: "#198cff" },
  { english: "PURPLE", russian: "фиолетовый", value: "#8c52ff" },
  { english: "PINK", russian: "розовый", value: "#ff5ca8" },
  { english: "WHITE", russian: "белый", value: "#ffffff", answerValue: "#ffffff" },
  { english: "BLACK", russian: "чёрный", value: "#17191f", answerValue: "#f2f4ff" },
];

const ARTWORKS = [
  { type: "css", name: "Круг", shape: "circle" },
  { type: "css", name: "Овал", shape: "oval" },
  { type: "css", name: "Квадрат", shape: "square" },
  { type: "css", name: "Треугольник", shape: "triangle" },
  { type: "css", name: "Прямоугольник", shape: "rectangle" },
  { type: "css", name: "Ромб", shape: "diamond" },
  { type: "css", name: "Пятиугольник", shape: "pentagon" },
  { type: "css", name: "Шестиугольник", shape: "hexagon" },
  { type: "css", name: "Звезда", shape: "star" },
];

const dom = {
  startScreen: document.querySelector("#startScreen"),
  playScreen: document.querySelector("#playScreen"),
  finishScreen: document.querySelector("#finishScreen"),
  startButton: document.querySelector("#startButton"),
  restartButton: document.querySelector("#restartButton"),
  roundCounter: document.querySelector("#roundCounter"),
  timer: document.querySelector("#timer"),
  timerValue: document.querySelector("#timerValue"),
  cssArtwork: document.querySelector("#cssArtwork"),
  fillWindow: document.querySelector("#fillWindow"),
  shapeColor: document.querySelector("#shapeColor"),
  pngArtwork: document.querySelector("#pngArtwork"),
  answer: document.querySelector("#answer"),
  answerEnglish: document.querySelector("#answerEnglish"),
  answerRussian: document.querySelector("#answerRussian"),
  progressDots: document.querySelector("#progressDots"),
  liveStatus: document.querySelector("#liveStatus"),
};

let rounds = [];
let currentRound = 0;
let frameId = 0;
let transitionTimer = 0;
let audioContext = null;
let activePngRenderer = null;
let gameToken = 0;

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function buildRounds() {
  const shuffledColors = shuffle(COLORS);
  const shuffledArtworks = shuffle(ARTWORKS);
  return shuffledColors.map((color, index) => ({
    color,
    artwork: shuffledArtworks[index % shuffledArtworks.length],
  }));
}

function showScreen(screen) {
  [dom.startScreen, dom.playScreen, dom.finishScreen].forEach((item) => {
    item.classList.toggle("is-active", item === screen);
  });
}

function initAudio() {
  if (!audioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioContext = new AudioContext();
  }
  if (audioContext?.state === "suspended") audioContext.resume();
}

function playRoundBell() {
  if (!audioContext) return;

  const now = audioContext.currentTime;
  const notes = [659.25, 783.99, 987.77];
  notes.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const startsAt = now + index * 0.085;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(0.22, startsAt + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.28);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + 0.3);
  });
}

function renderDots() {
  dom.progressDots.replaceChildren();
  rounds.forEach((round, index) => {
    const dot = document.createElement("span");
    dot.className = "progress-dot";
    dot.style.setProperty("--dot-color", round.color.value);
    if (index < currentRound) dot.classList.add("is-done");
    if (index === currentRound) dot.classList.add("is-current");
    dom.progressDots.append(dot);
  });
}

async function renderArtwork(artwork, color) {
  activePngRenderer = null;
  dom.cssArtwork.style.display = "none";
  dom.pngArtwork.style.display = "none";

  if (artwork.type === "image") {
    dom.pngArtwork.style.display = "block";
    activePngRenderer = await preparePngArtwork(artwork.src, color.value);
    activePngRenderer(0);
    return;
  }

  dom.cssArtwork.dataset.shape = artwork.shape;
  dom.cssArtwork.style.setProperty("--round-color", color.value);
  dom.cssArtwork.style.setProperty("--fill-progress", "0%");
  dom.cssArtwork.style.display = "block";
}

function setFillProgress(progress) {
  const percentage = `${Math.min(100, Math.max(0, progress * 100))}%`;
  if (activePngRenderer) {
    activePngRenderer(progress);
  } else {
    dom.cssArtwork.style.setProperty("--fill-progress", percentage);
  }
  dom.timer.style.setProperty("--timer-offset", String(270.18 * progress));
}

async function startGame() {
  cancelAnimationFrame(frameId);
  clearTimeout(transitionTimer);
  initAudio();
  gameToken += 1;
  rounds = buildRounds();
  currentRound = 0;
  showScreen(dom.playScreen);
  await startRound(gameToken);
}

async function startRound(token) {
  if (token !== gameToken) return;

  const round = rounds[currentRound];
  dom.answer.classList.remove("is-visible");
  dom.roundCounter.innerHTML = `<strong>${currentRound + 1}</strong><span>/ ${rounds.length}</span>`;
  dom.timerValue.textContent = "15";
  dom.timer.setAttribute("aria-label", "Осталось 15 секунд");
  dom.answerEnglish.textContent = round.color.english;
  dom.answerRussian.textContent = round.color.russian;
  dom.answer.style.setProperty("--answer-color", round.color.answerValue || round.color.value);
  renderDots();

  try {
    await renderArtwork(round.artwork, round.color);
  } catch (error) {
    console.error("Не удалось загрузить изображение:", error);
    await renderArtwork(ARTWORKS[0], round.color);
  }

  if (token !== gameToken) return;
  dom.liveStatus.textContent = `Раунд ${currentRound + 1}. Назовите цвет по-английски.`;
  const startedAt = performance.now();

  function tick(now) {
    if (token !== gameToken) return;
    const elapsed = now - startedAt;
    const progress = Math.min(1, elapsed / ROUND_DURATION_MS);
    const secondsLeft = Math.max(0, Math.ceil((ROUND_DURATION_MS - elapsed) / 1000));

    setFillProgress(progress);
    dom.timerValue.textContent = String(secondsLeft);
    dom.timer.setAttribute("aria-label", `Осталось ${secondsLeft} секунд`);

    if (progress < 1) {
      frameId = requestAnimationFrame(tick);
    } else {
      completeRound(token);
    }
  }

  frameId = requestAnimationFrame(tick);
}

function completeRound(token) {
  if (token !== gameToken) return;
  setFillProgress(1);
  playRoundBell();
  dom.answer.classList.add("is-visible");
  dom.liveStatus.textContent = `${rounds[currentRound].color.english}. ${rounds[currentRound].color.russian}.`;

  transitionTimer = window.setTimeout(async () => {
    if (token !== gameToken) return;
    currentRound += 1;
    if (currentRound >= rounds.length) {
      finishGame();
      return;
    }
    await startRound(token);
  }, ANSWER_DURATION_MS);
}

function finishGame() {
  dom.roundCounter.innerHTML = `<strong>${rounds.length}</strong><span>/ ${rounds.length}</span>`;
  showScreen(dom.finishScreen);
  dom.liveStatus.textContent = "Игра закончена. Все цвета пройдены.";
  dom.restartButton.focus({ preventScroll: true });
}

async function preparePngArtwork(src, color) {
  const canvas = dom.pngArtwork;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const image = await loadImage(src);
  const width = canvas.width;
  const height = canvas.height;
  const padding = 26;
  const scale = Math.min((width - padding * 2) / image.width, (height - padding * 2) / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;

  const outlineCanvas = document.createElement("canvas");
  outlineCanvas.width = width;
  outlineCanvas.height = height;
  const outlineContext = outlineCanvas.getContext("2d", { willReadFrequently: true });
  outlineContext.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  const pixels = outlineContext.getImageData(0, 0, width, height);
  const interiorMask = findClosedInterior(pixels, width, height);

  const fillCanvas = document.createElement("canvas");
  fillCanvas.width = width;
  fillCanvas.height = height;
  const fillContext = fillCanvas.getContext("2d");
  const fillPixels = fillContext.createImageData(width, height);
  const rgb = hexToRgb(color);

  for (let pixel = 0; pixel < interiorMask.length; pixel += 1) {
    if (!interiorMask[pixel]) continue;
    const channel = pixel * 4;
    fillPixels.data[channel] = rgb.r;
    fillPixels.data[channel + 1] = rgb.g;
    fillPixels.data[channel + 2] = rgb.b;
    fillPixels.data[channel + 3] = 255;
  }
  fillContext.putImageData(fillPixels, 0, 0);

  return (progress) => {
    const revealY = Math.round(height * (1 - progress));
    context.clearRect(0, 0, width, height);
    if (revealY < height) {
      context.drawImage(fillCanvas, 0, revealY, width, height - revealY, 0, revealY, width, height - revealY);
    }
    context.drawImage(outlineCanvas, 0, 0);
  };
}

function findClosedInterior(imageData, width, height) {
  const total = width * height;
  const outside = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const isLine = (index) => imageData.data[index * 4 + 3] > 48;
  const addOutside = (index) => {
    if (index < 0 || index >= total || outside[index] || isLine(index)) return;
    outside[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    addOutside(x);
    addOutside((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    addOutside(y * width);
    addOutside(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    if (x > 0) addOutside(index - 1);
    if (x < width - 1) addOutside(index + 1);
    if (index >= width) addOutside(index - width);
    if (index < total - width) addOutside(index + width);
  }

  const interior = new Uint8Array(total);
  for (let index = 0; index < total; index += 1) {
    if (!outside[index] && !isLine(index)) interior[index] = 1;
  }
  return interior;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Файл ${src} не найден или повреждён`));
    image.src = src;
  });
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3
    ? normalized.split("").map((character) => character + character).join("")
    : normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

dom.startButton.addEventListener("click", startGame);
dom.restartButton.addEventListener("click", startGame);

document.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && dom.startScreen.classList.contains("is-active")) {
    event.preventDefault();
    dom.startButton.click();
  }
});
