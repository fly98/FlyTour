// ---- Tracciamento utilizzo (stesso sistema di InternoUno Experience) ----
const TRACK_WORKER = 'https://wb-worker.f-castiglioni.workers.dev';
const TOUR_SLUG = (() => {
  const segs = location.pathname.split('/').filter(Boolean).filter(s => !s.includes('.'));
  return segs[segs.length - 1] || 'home';
})();
function trackEvent(event, section, lang){
  try{
    fetch(`${TRACK_WORKER}/wb/flytour/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, section: section || TOUR_SLUG, lang: lang || '' }),
      keepalive: true
    }).catch(()=>{});
  }catch(e){ /* mai bloccare l'esperienza per un ping di analytics */ }
}
trackEvent('tour_view', TOUR_SLUG);

// ---- Mappa ----
const map = L.map('map', {zoomControl:false, attributionControl:true}).setView(
  [STOPS[0].lat, STOPS[0].lon], 16
);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CARTO',
  maxZoom: 20
}).addTo(map);

const routeLatLngs = STOPS.map(s => [s.lat, s.lon]);
L.polyline(ROUTE_COORDS, {color:'#7c9a82', weight:4, opacity:0.85, lineJoin:'round'}).addTo(map);

const stopMarkers = {};
STOPS.forEach(s => {
  const icon = L.divIcon({
    className: '', html: `<div class="stop-marker${s.ready ? '' : ' pending'}" id="marker-${s.id}"><span>${s.id}</span></div>`,
    iconSize:[26,26], iconAnchor:[13,26]
  });
  const m = L.marker([s.lat, s.lon], {icon}).addTo(map);
  stopMarkers[s.id] = m;
});
map.fitBounds(ROUTE_COORDS, {padding:[40,40]});
setTimeout(() => {
  map.invalidateSize();
  map.fitBounds(ROUTE_COORDS, {padding:[24,24]});
}, 300);

function zoomToStop(stop){
  map.flyTo([stop.lat, stop.lon], 18, {duration: 0.6});
}
function zoomToOverview(){
  map.flyToBounds(ROUTE_COORDS, {padding:[24,24], duration: 0.6});
}

let meMarker = null;
function updateMeMarker(lat, lon){
  if(!meMarker){
    const icon = L.divIcon({className:'', html:'<div class="me-marker"></div>', iconSize:[16,16], iconAnchor:[8,8]});
    meMarker = L.marker([lat, lon], {icon, zIndexOffset:1000}).addTo(map);
  } else {
    meMarker.setLatLng([lat, lon]);
  }
}
function refreshStopMarkers(){
  STOPS.forEach(s => {
    const el = document.getElementById('marker-' + s.id);
    if(el) el.classList.toggle('done', state.played.has(s.id));
  });
}

const RADIUS_METERS = 45;
const STORAGE_KEY = 'flytour' + location.pathname.replace(/[^a-z0-9]/gi, '_');
const state = {
  played: new Set(JSON.parse(localStorage.getItem(STORAGE_KEY + '_played') || '[]')),
  autoplay: localStorage.getItem(STORAGE_KEY + '_autoplay') !== 'false',
  currentStopId: null,
  wakeLock: null,
  watchId: null
};
let currentLang = localStorage.getItem(STORAGE_KEY + '_lang') || 'it';
function saveLang(){ localStorage.setItem(STORAGE_KEY + '_lang', currentLang); }
function T(stop, field){
  return (stop.i18n && stop.i18n[currentLang]) ? stop.i18n[currentLang][field] : stop[field];
}

// ---- Utils ----
function haversine(lat1, lon1, lat2, lon2){
  const R = 6371000;
  const toRad = d => d * Math.PI/180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function savePlayed(){ localStorage.setItem(STORAGE_KEY + '_played', JSON.stringify([...state.played])); }
function saveAutoplay(){ localStorage.setItem(STORAGE_KEY + '_autoplay', state.autoplay); }

// ---- Render lista tappe + trail ----
function render(){
  const stopsEl = document.getElementById('stops');
  const trailEl = document.getElementById('trail');
  stopsEl.innerHTML = '';
  trailEl.innerHTML = '';
  refreshStopMarkers();

  STOPS.forEach((s, i) => {
    const done = state.played.has(s.id);
    const current = state.currentStopId === s.id;

    // trail dot
    const dot = document.createElement('div');
    dot.className = 'dot' + (done ? ' done' : '') + (current ? ' active' : '');
    dot.textContent = s.id;
    trailEl.appendChild(dot);
    if(i < STOPS.length - 1){
      const line = document.createElement('div');
      line.className = 'trail-line' + (done ? ' done' : '');
      trailEl.appendChild(line);
    }

    // stop card
    const el = document.createElement('div');
    el.className = 'stop' + (done ? ' done' : '') + (current ? ' current' : '') + (!s.ready ? ' pending' : '');
    const navUrl = `https://maps.apple.com/?daddr=${s.lat},${s.lon}&dirflg=w`;
    el.innerHTML = `
      <div class="stop-num">${String(s.id).padStart(2,'0')}</div>
      <div class="stop-body">
        <p class="stop-name">${T(s,'name')}</p>
        <p class="stop-desc">${T(s,'desc')}</p>
      </div>
      <div class="stop-actions">
        <a class="nav-link" href="${navUrl}" target="_blank" title="Naviga fin qui" data-navlink>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg>
        </a>
        ${s.ready
          ? `<button class="stop-text-btn" data-textbtn="${s.id}">Leggi</button><div class="stop-icon" data-playicon>${done ? '✓' : '▶'}</div>`
          : `<span class="pending-tag">in arrivo</span>`}
      </div>
    `;
    el.querySelector('[data-navlink]').onclick = (e) => e.stopPropagation();
    if(s.ready){
      el.querySelector('.stop-body').onclick = () => playStop(s.id, true);
      el.querySelector('[data-playicon]').onclick = () => playStop(s.id, true);
      el.querySelector('[data-textbtn]').onclick = (e) => { e.stopPropagation(); openTextModal(s.id); };
    }
    stopsEl.appendChild(el);
  });
}

// ---- Player ----
const audioEl = document.getElementById('audioEl');
const playerEl = document.getElementById('player');
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.getElementById('playIcon');
const seekBar = document.getElementById('seekBar');
const timeElapsed = document.getElementById('timeElapsed');
const timeRemaining = document.getElementById('timeRemaining');

function fmtTime(sec){
  if(!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

function playStop(id, manual){
  const stop = STOPS.find(s => s.id === id);
  if(!stop) return;
  state.currentStopId = id;
  zoomToStop(stop);
  currentPhotoUrl = null;
  document.getElementById('playerName').textContent = T(stop,'name');
  audioEl.src = T(stop,'audio');
  audioEl.play().catch(()=>{ /* iOS può richiedere un tap: il bottone play resta disponibile */ });
  playerEl.classList.add('show');
  state.played.add(id);
  savePlayed();
  render();
  requestWakeLock();
  trackEvent(manual ? 'stop_play_manual' : 'stop_play_auto', TOUR_SLUG, typeof currentLang !== 'undefined' ? currentLang : '');
}

playPauseBtn.onclick = () => {
  if(audioEl.paused){ audioEl.play(); } else { audioEl.pause(); }
};
document.getElementById('backBtn').onclick = () => { audioEl.currentTime = Math.max(0, audioEl.currentTime - 15); };
document.getElementById('fwdBtn').onclick = () => { audioEl.currentTime = Math.min(audioEl.duration || 0, audioEl.currentTime + 15); };
document.getElementById('playerCloseBtn').onclick = () => {
  audioEl.pause();
  playerEl.classList.remove('show');
  state.currentStopId = null;
  render();
  zoomToOverview();
  stopAllVideos();
};

// ---- Reset sessione ----
document.getElementById('resetBtn').onclick = () => {
  if(!confirm('Ricominciare il giro da capo? Le tappe già ascoltate torneranno disponibili.')) return;
  audioEl.pause();
  playerEl.classList.remove('show');
  state.played = new Set();
  state.currentStopId = null;
  currentPhotoUrl = null;
  zoomToOverview();
  localStorage.removeItem(STORAGE_KEY + '_played');
  render();
};

audioEl.onplay = () => { playIcon.setAttribute('d','M6 5h4v14H6zM14 5h4v14h-4z'); };
audioEl.onpause = () => { playIcon.setAttribute('d','M8 5v14l11-7z'); };
audioEl.onended = () => { showEndOverlay(state.currentStopId); };
audioEl.onloadedmetadata = () => { seekBar.max = audioEl.duration; };
audioEl.ontimeupdate = () => {
  if(!seekBar.matches(':active')){ seekBar.value = audioEl.currentTime; }
  timeElapsed.textContent = fmtTime(audioEl.currentTime);
  timeRemaining.textContent = '-' + fmtTime((audioEl.duration || 0) - audioEl.currentTime);
  updatePhoto(audioEl.currentTime);
};
seekBar.addEventListener('input', () => { audioEl.currentTime = seekBar.value; });

// ---- Pannello foto sincronizzato ----
const photoImg = document.getElementById('photoImg');
const photoCaption = document.getElementById('photoCaption');
let currentPhotoUrl = null;

function updatePhoto(t){
  const stop = STOPS.find(s => s.id === state.currentStopId);
  const photos = stop && T(stop,'photos');
  if(!stop || !photos || !photos.length) return;
  let active = photos[0];
  for(const p of photos){ if(t >= p.time) active = p; }
  if(active.url !== currentPhotoUrl){
    currentPhotoUrl = active.url;
    photoImg.classList.remove('show');
    setTimeout(() => {
      photoImg.src = active.url;
      photoCaption.textContent = active.caption + ' · ' + active.credit;
      photoImg.onload = () => photoImg.classList.add('show');
    }, 300);
  }
}

// ---- Overlay arrivo tappa (quando autoplay è OFF) ----
const overlay = document.getElementById('arrivalOverlay');
let pendingStopId = null;

function showArrival(stopId){
  const stop = STOPS.find(s => s.id === stopId);
  pendingStopId = stopId;
  document.getElementById('arrivalTitle').textContent = T(stop,'name');
  overlay.classList.add('show');
}
document.getElementById('playNowBtn').onclick = () => {
  overlay.classList.remove('show');
  if(pendingStopId) playStop(pendingStopId, false);
};
document.getElementById('laterBtn').onclick = () => {
  overlay.classList.remove('show');
};

document.getElementById('autoplayToggle').onchange = (e) => {
  state.autoplay = e.target.checked;
  saveAutoplay();
};
document.getElementById('autoplayToggle').checked = state.autoplay;

// ---- Rendering condiviso approfondimenti (video + link) ----
const ICON_VIDEO = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 15.5l6-3.5-6-3.5v7zM12 3C7 3 2.7 3.3 2.7 3.3S2 3.4 1.4 3.7C.9 4 .5 4.5.3 5.1c0 0-.3 1.8-.3 3.5v2.7c0 1.8.3 3.5.3 3.5.2.6.6 1.1 1.1 1.4.6.3 1.3.4 1.3.4S7 17 12 17s5-.3 5-.3.7-.1 1.3-.4c.5-.3.9-.8 1.1-1.4 0 0 .3-1.8.3-3.5V8.6c0-1.8-.3-3.5-.3-3.5-.2-.6-.6-1.1-1.1-1.4C17.7 3.4 17 3.3 17 3.3S12 3 12 3z"/></svg>`;
const ICON_LINK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.07 0l2.83-2.83a5 5 0 00-7.07-7.07L11.5 4.5M14 11a5 5 0 00-7.07 0L4.1 13.83a5 5 0 007.07 7.07L12.5 19.5"/></svg>`;

function extractYouTubeId(url){
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function renderDeepenList(items){
  return items.map(v => {
    if(v.type === 'video'){
      const vid = extractYouTubeId(v.url);
      if(vid){
        return `
    <div class="yt-video-block">
      <button class="yt-link yt-video-toggle" data-vid="${vid}">
        ${ICON_VIDEO}
        ${v.title}
      </button>
      <div class="yt-video-embed" style="display:none;"></div>
    </div>`;
      }
    }
    return `
    <a class="yt-link" href="${v.url}" target="_blank">
      ${v.type === 'video' ? ICON_VIDEO : ICON_LINK}
      ${v.title}
    </a>`;
  }).join('');
}
function handleVideoToggle(e){
  const btn = e.target.closest('.yt-video-toggle');
  if(!btn) return;
  const block = btn.closest('.yt-video-block');
  const embed = block.querySelector('.yt-video-embed');
  if(embed.style.display === 'none'){
    audioEl.pause();
    if(!embed.dataset.loaded){
      embed.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${btn.dataset.vid}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
      embed.dataset.loaded = "1";
    }
    embed.style.display = 'block';
  } else {
    embed.style.display = 'none';
  }
}
document.getElementById('ytLinksList').addEventListener('click', handleVideoToggle);
document.getElementById('endYtLinksList').addEventListener('click', handleVideoToggle);

// ---- Modal testo scritto ----
const textModalOverlay = document.getElementById('textModalOverlay');
function openTextModal(stopId){
  const stop = STOPS.find(s => s.id === stopId);
  if(!stop) return;
  document.getElementById('textModalTitle').textContent = T(stop,'name');
  document.getElementById('textModalBody').innerHTML = T(stop,'fullText') || '';
  const ytWrap = document.getElementById('ytLinks');
  const ytList = document.getElementById('ytLinksList');
  const deepen = T(stop,'deepen');
  if(deepen && deepen.length){
    ytList.innerHTML = renderDeepenList(deepen);
    ytWrap.style.display = 'block';
  } else {
    ytWrap.style.display = 'none';
  }
  textModalOverlay.classList.add('show');
}
function stopAllVideos(){
  document.querySelectorAll('.yt-video-embed').forEach(embed => {
    embed.innerHTML = '';
    embed.style.display = 'none';
    delete embed.dataset.loaded;
  });
}
document.getElementById('textModalClose').onclick = () => { textModalOverlay.classList.remove('show'); stopAllVideos(); };
textModalOverlay.onclick = (e) => { if(e.target === textModalOverlay){ textModalOverlay.classList.remove('show'); stopAllVideos(); } };

// ---- Overlay fine tappa con approfondimenti ----
const endOverlay = document.getElementById('endOverlay');
function showEndOverlay(stopId){
  const stop = STOPS.find(s => s.id === stopId);
  if(!stop) return;
  document.getElementById('endTitle').textContent = T(stop,'name') + ' — completata';
  const ytWrap = document.getElementById('endYtLinks');
  const ytList = document.getElementById('endYtLinksList');
  const deepen = T(stop,'deepen');
  if(deepen && deepen.length){
    ytList.innerHTML = renderDeepenList(deepen);
    ytWrap.style.display = 'block';
  } else {
    ytWrap.style.display = 'none';
  }
  endOverlay.classList.add('show');
}
document.getElementById('endCloseBtn').onclick = () => {
  endOverlay.classList.remove('show');
  audioEl.pause();
  playerEl.classList.remove('show');
  state.currentStopId = null;
  render();
  zoomToOverview();
  stopAllVideos();
};

// ---- Toggle lingua (solo per giri bilingue: STOPS[0].i18n presente) ----
const langToggleBtn = document.getElementById('langToggle');

// ---- Link "Tutti i percorsi": torna alla pagina di provenienza (root o personale) invece che sempre alla root ----
const backLinkEl = document.querySelector('.back-link');
if(backLinkEl){
  backLinkEl.addEventListener('click', (e) => {
    if(document.referrer && document.referrer.includes(location.host)){
      e.preventDefault();
      history.back();
    }
  });
}

const isBilingual = !!(STOPS[0] && STOPS[0].i18n);
if(langToggleBtn){
  if(isBilingual){
    langToggleBtn.style.display = 'flex';
    function renderLangToggle(){
      langToggleBtn.querySelectorAll('[data-lang]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === currentLang);
      });
    }
    langToggleBtn.querySelectorAll('[data-lang]').forEach(btn => {
      btn.onclick = () => {
        if(btn.dataset.lang === currentLang) return;
        currentLang = btn.dataset.lang;
        saveLang();
        renderLangToggle();
        render();
        trackEvent('lang', TOUR_SLUG, currentLang);
        // se una tappa è aperta nel player, ricarica testo/audio nella nuova lingua
        if(state.currentStopId){
          const stop = STOPS.find(s => s.id === state.currentStopId);
          if(stop){
            document.getElementById('playerName').textContent = T(stop,'name');
            const wasPlaying = !audioEl.paused;
            audioEl.src = T(stop,'audio');
            if(wasPlaying) audioEl.play().catch(()=>{});
          }
        }
        // se il modal testo è aperto, ricarica nella nuova lingua
        if(textModalOverlay.classList.contains('show') && state.currentStopId){
          openTextModal(state.currentStopId);
        }
      };
    });
    renderLangToggle();
  } else {
    langToggleBtn.style.display = 'none';
  }
}

// ---- Geolocalizzazione ----
const gpsDot = document.getElementById('gpsDot');
const gpsText = document.getElementById('gpsText');
const gpsDebug = document.getElementById('gpsDebug');
document.getElementById('gpsStatusRow').addEventListener('click', (e) => {
  if(e.target.closest('#resetBtn')) return; // non interferire col pulsante ricomincia
  gpsDebug.style.display = gpsDebug.style.display === 'none' ? 'block' : 'none';
});
let gpsUpdateCount = 0;
let gpsErrorCount = 0;
function fmtClockTime(){
  const d = new Date();
  return d.toLocaleTimeString('it-IT', {hour12:false});
}
function renderGpsDebug(extra){
  gpsDebug.textContent = `debug GPS · aggiornamenti ricevuti: ${gpsUpdateCount} · errori: ${gpsErrorCount} · ${extra}`;
}

function onPosition(pos){
  gpsDot.classList.add('live');
  gpsUpdateCount++;
  const { latitude, longitude, accuracy } = pos.coords;
  renderGpsDebug(`ultimo fix: ${fmtClockTime()} · precisione: ${Math.round(accuracy)}m · lat/lon: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
  updateMeMarker(latitude, longitude);

  let nearest = null, nearestDist = Infinity;
  STOPS.forEach(s => {
    if(state.played.has(s.id)) return; // già ascoltata, non ritriggerare
    const d = haversine(latitude, longitude, s.lat, s.lon);
    if(d < nearestDist){ nearestDist = d; nearest = s; }
  });

  if(nearest){
    gpsText.textContent = `A ${Math.round(nearestDist)} m dalla prossima tappa — ${nearest.name}`;
    if(nearestDist <= RADIUS_METERS && state.currentStopId !== nearest.id){
      if(state.autoplay){
        playStop(nearest.id, false);
      } else {
        showArrival(nearest.id);
      }
    }
  } else {
    gpsText.textContent = "Hai ascoltato tutte le tappe del pilota 🎉";
  }
}
function onGpsError(err){
  gpsDot.classList.remove('live');
  gpsErrorCount++;
  renderGpsDebug(`ultimo errore: ${fmtClockTime()} · codice ${err.code} · "${err.message}"`);
  gpsText.textContent = "GPS non disponibile (" + err.message + ") — usa la lista qui sotto";
}

function startGps(){
  if(!navigator.geolocation){
    gpsText.textContent = "Il browser non supporta la geolocalizzazione";
    renderGpsDebug("navigator.geolocation non disponibile");
    return;
  }
  renderGpsDebug(`watch avviato: ${fmtClockTime()} · in attesa del primo fix...`);
  state.watchId = navigator.geolocation.watchPosition(onPosition, onGpsError, {
    enableHighAccuracy: true, maximumAge: 5000, timeout: 15000
  });
}

// ---- Wake Lock (schermo sempre acceso mentre l'app è in uso) ----
async function requestWakeLock(){
  try{
    if('wakeLock' in navigator){
      state.wakeLock = await navigator.wakeLock.request('screen');
    }
  }catch(e){ /* silenzioso: non tutti i browser lo supportano */ }
}
function restartGps(reason){
  if(state.watchId != null){
    navigator.geolocation.clearWatch(state.watchId);
  }
  renderGpsDebug(`${reason} alle ${fmtClockTime()} · riavvio GPS...`);
  startGps();
  // richiesta immediata di un fix singolo, senza aspettare il prossimo giro del watch
  navigator.geolocation.getCurrentPosition(onPosition, onGpsError, {
    enableHighAccuracy: true, maximumAge: 0, timeout: 15000
  });
}
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible'){
    if(state.currentStopId) requestWakeLock();
    // iOS può congelare/uccidere il watchPosition mentre la pagina è in background:
    // al ritorno in primo piano lo cancelliamo e lo riavviamo da zero per essere sicuri
    // di ricevere aggiornamenti freschi invece di restare agganciati a un watch morto.
    restartGps('pagina tornata visibile');
  }
});

// ---- Avvio ----
render();
restartGps('avvio app');
requestWakeLock();