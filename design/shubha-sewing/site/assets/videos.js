/* Pure renderer: accepts the same records from a future CMS/API adapter.
   Invalid/missing IDs are omitted; zero valid records hides the section.
   Uses real YouTube watch links, not a simulated player. */
function renderStudioVideos(records = window.SHUBHA_VIDEOS || []) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const videos = (Array.isArray(records) ? records : []).filter(v => v && /^[a-zA-Z0-9_-]{11}$/.test(v.videoId) && typeof v.title === 'string' && v.title.trim()).slice(0,3);
  if (!videos.length) return '';
  const cards = videos.map(video => {
    const canonical = 'https://www.youtube.com/watch?v=' + video.videoId;
    let url = canonical;
    try {
      const supplied = new URL(video.youtubeUrl);
      if (supplied.protocol === 'https:' && ['youtube.com','www.youtube.com'].includes(supplied.hostname) && supplied.pathname === '/watch' && supplied.searchParams.get('v') === video.videoId) url = supplied.href;
    } catch {}
    let thumbnail = 'https://i.ytimg.com/vi/' + video.videoId + '/hqdefault.jpg';
    if (typeof video.thumbnail === 'string' && (/^https:\/\//i.test(video.thumbnail) || /^assets\/[\w./-]+$/.test(video.thumbnail))) thumbnail = video.thumbnail;
    return `<article class="studio-card"><a class="studio-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escape('Watch '+video.title+' on YouTube (opens in a new tab)')}"><span class="studio-image"><img src="${escape(thumbnail)}" alt="" loading="lazy" width="480" height="270" onerror="this.style.display='none'"><span class="studio-play" aria-hidden="true"><svg viewBox="0 0 12 14"><path d="M1 1L11 7 1 13Z"/></svg></span></span><span class="studio-meta">${video.category ? `<span>${escape(video.category)}</span>` : ''}${video.duration ? `<span>${escape(video.duration)}</span>` : ''}</span><h3>${escape(video.title)}</h3><span class="studio-watch">Watch on YouTube ↗</span></a></article>`;
  }).join('');
  return `<section class="wrap studio-section" aria-labelledby="studio-heading"><div class="studio-intro"><div class="eyebrow">From the studio</div><h2 id="studio-heading">Watch &amp; Learn</h2><p>See our machines in action, discover techniques, and learn from the people who make.</p></div><div class="studio-grid">${cards}</div><a class="textlink studio-channel" href="https://www.youtube.com/@shubhasewing" target="_blank" rel="noopener noreferrer">More from the studio ↗</a>${videos.some(video => video.demo) ? '<p class="studio-demo">Demo selection · Third-party tutorials shown for layout preview. Shubha’s videos will replace these selections.</p>' : ''}</section>`;
}
