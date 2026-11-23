const toggle = document.querySelector('#music-toggle');
const toggleText = toggle.querySelector('span');
const dialog = document.querySelector('#table-music');
const fileInput = document.querySelector('#music-file');
const audio = document.querySelector('#music-audio');
const queue = document.querySelector('#music-queue');
const status = document.querySelector('#music-status');
const backgroundUrl = audio.getAttribute('src');
let trackUrl;
let tracks = [];
let autoplayBlocked = false;
const autoplayEvents = new AbortController();
audio.volume = .85;

toggle.addEventListener('click', () => dialog.showModal());
document.querySelector('#music-choose').addEventListener('click', () => fileInput.click());

function updateIndicator() {
  const playing = !audio.paused && audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  toggle.toggleAttribute('data-playing',playing);
  toggleText.textContent = playing ? '播放中' : autoplayBlocked ? '待播放' : '音乐';
  toggle.setAttribute('aria-label',playing ? '牌桌音乐，播放中' : '牌桌音乐');
}

audio.addEventListener('playing', () => {
  autoplayBlocked = false;
  autoplayEvents.abort();
  status.hidden = true;
  updateIndicator();
});
audio.addEventListener('waiting', updateIndicator);
audio.addEventListener('pause', updateIndicator);
audio.addEventListener('error', () => {
  status.hidden = false;
  status.textContent = queue.selectedIndex === 0 ? '背景音乐加载失败，请刷新页面。' : '这份音频无法播放。可以选择 MP3 或 M4A 文件。';
  updateIndicator();
});

async function playTrack(index, automatic = false) {
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
      autoplayBlocked = automatic;
      status.hidden = false;
      status.textContent = automatic ? '浏览器正在等待一次点击或按键。' : '点击播放器上的播放键。';
      updateIndicator();
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

function retryAutoplay(event) {
  if (!event.isTrusted || event.target === audio || !audio.paused || queue.selectedIndex !== 0) return;
  void playTrack(0,true);
}

const gestureOptions = { capture:true, signal:autoplayEvents.signal };
for (const event of ['pointerdown','pointerup','touchend','click','keydown']) {
  document.addEventListener(event,retryAutoplay,gestureOptions);
}
void playTrack(0,true);
