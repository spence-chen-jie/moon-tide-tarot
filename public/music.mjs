const toggle = document.querySelector('#music-toggle');
const dialog = document.querySelector('#table-music');
const fileInput = document.querySelector('#music-file');
const audio = document.querySelector('#music-audio');
const queue = document.querySelector('#music-queue');
const status = document.querySelector('#music-status');
const backgroundUrl = audio.getAttribute('src');
let trackUrl;
let tracks = [];
let started = false;
audio.volume = .4;

toggle.addEventListener('click', () => dialog.showModal());
document.querySelector('#music-choose').addEventListener('click', () => fileInput.click());

function updateIndicator() {
  toggle.toggleAttribute('data-playing', !audio.paused);
  toggle.setAttribute('aria-label', audio.paused ? '牌桌音乐' : '牌桌音乐，播放中');
}

audio.addEventListener('play', () => {
  started = true;
  updateIndicator();
});
audio.addEventListener('pause', updateIndicator);
audio.addEventListener('error', () => {
  status.hidden = false;
  status.textContent = '这份音频无法播放。可以选择 MP3 或 M4A 文件。';
  updateIndicator();
});

async function playTrack(index) {
  const file = tracks[index - 1];
  const previousUrl = trackUrl;
  trackUrl = file ? URL.createObjectURL(file) : undefined;
  const selectedUrl = trackUrl ?? backgroundUrl;
  if (audio.getAttribute('src') !== selectedUrl) audio.setAttribute('src',selectedUrl);
  if (previousUrl) URL.revokeObjectURL(previousUrl);
  queue.selectedIndex = index;
  audio.loop = index === 0;
  status.hidden = true;
  status.textContent = '';
  try {
    await audio.play();
  } catch (error) {
    if (audio.getAttribute('src') === selectedUrl && error.name === 'NotAllowedError') {
      status.hidden = false;
      status.textContent = '点击播放器上的播放键。';
    }
  }
}

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files);
  fileInput.value = '';
  if (!files.length) return;
  tracks = files;
  queue.replaceChildren(new Option('牌桌背景音乐'), ...tracks.map(file => new Option(file.name)));
  queue.hidden = false;
  void playTrack(1);
});

queue.addEventListener('change', () => void playTrack(queue.selectedIndex));
audio.addEventListener('ended', () => {
  if (queue.selectedIndex > 0) void playTrack(queue.selectedIndex % tracks.length + 1);
});

export function startTableMusic() {
  if (started || queue.selectedIndex !== 0) return;
  started = true;
  void playTrack(0);
}

export function stopTableMusic() {
  if (queue.selectedIndex === 0) audio.pause();
}
