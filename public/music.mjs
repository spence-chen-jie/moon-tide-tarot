const toggle = document.querySelector('#music-toggle');
const dialog = document.querySelector('#table-music');
const fileInput = document.querySelector('#music-file');
const audio = document.querySelector('#music-audio');
const queue = document.querySelector('#music-queue');
const status = document.querySelector('#music-status');
let trackUrl;
let tracks = [];
audio.volume = .3;

toggle.addEventListener('click', () => dialog.showModal());
document.querySelector('#music-choose').addEventListener('click', () => fileInput.click());

function updateIndicator() {
  toggle.toggleAttribute('data-playing', !audio.paused);
  toggle.setAttribute('aria-label', audio.paused ? '牌桌音乐' : '牌桌音乐，播放中');
}

audio.addEventListener('play', updateIndicator);
audio.addEventListener('pause', updateIndicator);
audio.addEventListener('error', () => {
  status.hidden = false;
  status.textContent = '这份音频无法播放。可以选择 MP3 或 M4A 文件。';
  updateIndicator();
});

async function playTrack(index) {
  const file = tracks[index];
  const previousUrl = trackUrl;
  const selectedUrl = trackUrl = URL.createObjectURL(file);
  audio.src = trackUrl;
  if (previousUrl) URL.revokeObjectURL(previousUrl);
  queue.selectedIndex = index;
  audio.hidden = false;
  status.hidden = true;
  status.textContent = '';
  try {
    await audio.play();
  } catch (error) {
    if (trackUrl === selectedUrl && error.name === 'NotAllowedError') {
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
  queue.replaceChildren(...tracks.map(file => new Option(file.name)));
  queue.hidden = false;
  void playTrack(0);
});

queue.addEventListener('change', () => void playTrack(queue.selectedIndex));
audio.addEventListener('ended', () => void playTrack((queue.selectedIndex + 1) % tracks.length));
