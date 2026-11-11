/**
 * LUMIA social robot — draws the post pictures (JPEG, 1080×1350 for the feed, 1080×1920 for Stories and Reels)
 * from brand templates, and makes the Reel video with ffmpeg.
 * Colours and fonts are the website's own (logo palette).
 */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const FONT_CSS = process.env.FONT_CSS || 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cormorant+Garamond:wght@400;500;600&family=Montserrat:wght@400;500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap';
const hx = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nm = p => p.nameAr || p.nameEn || p.name;

const CSS = `
:root{--page:#f3e9e4;--well:#e9dcd5;--ink:#2c2325;--muted:#6a5d5e;--pri:#6e4438;--band:#4a2c28;--wine:#8a3445}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"IBM Plex Sans Arabic",sans-serif;color:var(--ink);background:var(--page)}
.s{width:1080px;height:1350px;background:var(--page);position:relative;overflow:hidden;direction:rtl}
.s.tall{height:1920px}
.top{display:flex;align-items:center;justify-content:space-between;padding:56px 70px 0}
.tall .top{padding-top:150px}
.brand{display:flex;align-items:center;gap:18px;direction:ltr}
.brand img{width:76px;height:76px}
.brand b{font-family:"Cormorant Garamond",serif;font-weight:500;font-size:44px;letter-spacing:10px;color:var(--band)}
.chip{font-size:27px;font-weight:500;color:var(--pri);border:2px solid var(--pri);border-radius:40px;padding:8px 26px;white-space:nowrap}
h1{font-family:"Amiri",serif;font-weight:700;font-size:76px;line-height:1.28;color:var(--band);padding:40px 70px 0}
h1.m{font-size:64px}
.sub{font-size:32px;color:var(--muted);padding:14px 70px 0;line-height:1.5}
.lat{font-family:Montserrat;font-weight:500;color:var(--pri);direction:ltr;unicode-bidi:isolate}
.card{position:absolute;left:70px;right:70px;background:#fff;border-radius:36px;display:flex;align-items:center;justify-content:center;box-shadow:0 18px 50px rgba(74,44,40,.12);overflow:hidden}
.card img{max-height:92%;max-width:88%;object-fit:contain}
.price{position:absolute;left:40px;width:230px;height:230px;border-radius:50%;background:var(--wine);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:rotate(-8deg);box-shadow:0 12px 30px rgba(138,52,69,.35);z-index:3}
.price s{font-family:Montserrat;font-size:30px;opacity:.75}
.price b{font-family:Montserrat;font-weight:600;font-size:64px;line-height:1}
.price i{font-style:normal;font-size:26px}
.feat{position:absolute;left:50px;right:50px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.feat span{background:var(--well);border-radius:30px;padding:10px 24px;font-size:27px;color:var(--band)}
.feat span.pre{background:var(--pri);color:#fff}
.band{position:absolute;bottom:0;left:0;right:0;height:120px;background:var(--band);color:#f3e9e4;display:flex;align-items:center;justify-content:center;gap:24px;font-size:29px}
.tall .band{height:200px;padding-bottom:60px}
.band em{font-style:normal;opacity:.5}
.two{position:absolute;top:430px;left:70px;right:70px;display:flex;gap:40px}
.two div{flex:1;background:#fff;border-radius:32px;height:600px;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 18px 50px rgba(74,44,40,.12);padding:20px}
.two img{height:430px;max-width:100%;object-fit:contain}
.two p{font-size:30px;font-weight:600;color:var(--band);margin-top:8px;text-align:center;line-height:1.35}
.two small{font-size:22px;color:var(--muted);direction:ltr}
.vs{position:absolute;top:670px;left:50%;transform:translateX(-50%);width:120px;height:120px;border-radius:50%;background:var(--wine);color:#fff;font-family:"Cormorant Garamond",serif;font-size:52px;font-style:italic;display:flex;align-items:center;justify-content:center;z-index:2}
.swipe{position:absolute;bottom:170px;left:0;right:0;text-align:center;font-size:34px;color:var(--pri);font-weight:500}
.dots{position:absolute;bottom:140px;left:0;right:0;display:flex;justify-content:center;gap:12px}
.dots i{width:14px;height:14px;border-radius:50%;background:var(--well)}.dots i.on{background:var(--pri);width:40px;border-radius:8px}
.num{position:absolute;top:60px;left:70px;font-family:Montserrat;font-size:30px;color:var(--muted);direction:ltr}
.pts{position:absolute;left:70px;right:70px;top:960px;list-style:none}
.pts li{font-size:36px;line-height:1.5;padding:10px 0 10px 0;border-bottom:2px solid var(--well);display:flex;gap:18px;align-items:flex-start}
.pts li:before{content:"✦";color:var(--wine);font-size:28px;margin-top:8px}
.pn{position:absolute;left:70px;right:70px;top:880px;font-size:30px;color:var(--muted)}
.steps{position:absolute;top:400px;left:70px;right:70px;display:flex;flex-direction:column;gap:28px}
.st{background:#fff;border-radius:30px;display:flex;align-items:center;gap:30px;padding:22px 30px;box-shadow:0 12px 34px rgba(74,44,40,.10);height:240px}
.st img{width:180px;height:190px;object-fit:contain}
.st .n{width:74px;height:74px;border-radius:50%;background:var(--wine);color:#fff;font-family:Montserrat;font-size:36px;font-weight:600;display:flex;align-items:center;justify-content:center;flex:none}
.st h3{font-size:36px;color:var(--band)}.st p{font-size:27px;color:var(--muted);line-height:1.4}.st b{font-size:25px;color:var(--pri);font-weight:500}
.facts{position:absolute;top:430px;left:70px;right:70px;display:flex;flex-direction:column;gap:26px}
.fact{background:#fff;border-radius:28px;padding:30px 36px;display:flex;align-items:center;gap:28px;font-size:36px;color:var(--band);box-shadow:0 12px 34px rgba(74,44,40,.08)}
.fact i{font-style:normal;font-size:40px}.fact .ic{flex:none;width:76px;height:76px;border-radius:50%;background:var(--wine);color:#fff;display:flex;align-items:center;justify-content:center;font-family:Montserrat;font-weight:600}
.row3{position:absolute;bottom:170px;left:70px;right:70px;display:flex;gap:24px}
.row3 div{flex:1;background:#fff;border-radius:24px;height:280px;display:flex;align-items:center;justify-content:center}
.row3 img{max-height:240px;max-width:90%;object-fit:contain}
.cta{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;text-align:center}
.cta .big img{width:150px;height:150px}.cta .big b{font-size:84px;letter-spacing:18px}
.cta h2{font-family:"Amiri",serif;font-size:72px;color:var(--band)}
.cta p{font-size:36px;color:var(--muted);line-height:1.6}
.cta .wa{background:#1f7a4c;color:#fff;border-radius:60px;padding:22px 54px;font-size:40px;font-weight:600;direction:ltr}
.line{position:absolute;left:70px;right:70px;top:1180px;font-family:"Amiri",serif;font-weight:700;font-size:84px;line-height:1.3;color:var(--band);text-align:center}
`;

const head = (chip) => `<div class="top"><div class="brand"><img src="logo-mark.png"><b>LUMIA</b></div>${chip ? `<div class="chip">${hx(chip)}</div>` : ''}</div>`;
const band = (d) => `<div class="band">التوصيل لجميع المحافظات <em>|</em> الدفع عند الاستلام <em>|</em> الطلب عبر الموقع أو واتساب</div>`;
const priceBadge = (p, top) => `<div class="price" style="top:${top}px">${+p.was > +p.price ? `<s>${hx(p.was)}</s>` : ''}<b>${hx(p.price)}</b><i>جنيه</i></div>`;
const preChip = p => (p.stock > 0 ? '' : `<span class="pre">طلب مسبق</span>`);
const sizeTxt = p => p.size ? ` · <span class="lat">${hx(p.size)}</span>` : '';

/* one page (slide) of a post → HTML */
const T = {
  spotlight(w, [p], o = {}) {
    const tall = !!o.tall, cardTop = tall ? 700 : 500, cardH = tall ? 820 : 600;
    return `<div class="s${tall ? ' tall' : ''}">${head(o.chip || 'أصلي من ألمانيا')}
      <h1${(w.headline || '').length > 26 ? ' class="m"' : ''}>${hx(w.headline || nm(p))}</h1>
      <div class="sub"><span class="lat">${hx(p.brand)}</span> · ${hx(nm(p))}${sizeTxt(p)}</div>
      <div class="card" style="top:${cardTop}px;height:${cardH}px"><img src="${hx(p.image)}"></div>
      <div class="feat" style="top:${cardTop + cardH + 26}px">${preChip(p)}${(w.chips || []).map(c => `<span>${hx(c)}</span>`).join('')}</div>
      ${band()}</div>`;
  },
  compare(w, ps) {
    return `<div class="s">${head('أيهما يناسب؟')}<h1>${hx(w.title)}</h1><div class="sub">${hx(w.sub || '')}</div>
      <div class="two">${ps.map(p => `<div><img src="${hx(p.image)}"><p>${hx((w.labels || {})[p.id] || nm(p))}</p><small>${hx(p.brand)}</small></div>`).join('')}</div>
      <div class="vs">vs</div>${band()}</div>`;
  },
  guideCover(w, ps, n) {
    return `<div class="s">${head('دليل العناية')}<h1>${hx(w.title)}</h1><div class="sub">${hx(w.sub || '')}</div>
      <div class="two" style="top:470px">${ps.slice(0, 3).map(p => `<div style="height:560px"><img src="${hx(p.image)}" style="height:420px"></div>`).join('')}</div>
      <div class="swipe">اسحب لمعرفة المزيد ←</div><div class="dots">${Array.from({ length: n }, (_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>${band()}</div>`;
  },
  guideSlide(sl, p, i, n) {
    return `<div class="s"><div class="num">${i + 1} / ${n}</div>${head('')}
      <h1 class="m" style="padding-top:30px">${hx(sl.title)}</h1>
      <div class="card" style="top:290px;height:560px"><img src="${hx(p.image)}"></div>
      <div class="pn"><span class="lat">${hx(p.brand)}</span> · ${hx(nm(p))}${sizeTxt(p)}</div>
      <ul class="pts">${sl.points.map(x => `<li>${hx(x)}</li>`).join('')}</ul>
      <div class="dots">${Array.from({ length: n }, (_, k) => `<i${k === i ? ' class="on"' : ''}></i>`).join('')}</div>${band()}</div>`;
  },
  cta(d, i, n) {
    return `<div class="s"><div class="cta"><div class="brand big"><img src="logo-mark.png"><b>LUMIA</b></div><h2>للطلب عبر الموقع أو واتساب</h2>
      <div class="wa" style="background:var(--band)">${hx(d.site)}</div><div class="wa">${hx(d.waText)}</div><p>منتجات أصلية مستوردة من ألمانيا<br>التوصيل لجميع المحافظات · الدفع عند الاستلام</p></div>
      ${n ? `<div class="dots">${Array.from({ length: n }, (_, k) => `<i${k === i ? ' class="on"' : ''}></i>`).join('')}</div>` : ''}</div>`;
  },
  routine(w, ps) {
    const by = Object.fromEntries(ps.map(p => [p.id, p]));
    const steps = (w.steps || []).filter(s => by[s.id]).slice(0, 3);
    return `<div class="s">${head(w.when || 'روتين العناية')}<h1>${hx(w.title)}</h1>
      <div class="steps">${steps.map((s, i) => { const p = by[s.id]; return `<div class="st"><div class="n">${i + 1}</div><img src="${hx(p.image)}"><div><h3>${hx(s.step)}</h3><p>${hx(s.why)}</p><b><span class="lat">${hx(p.brand)}</span></b></div></div>`; }).join('')}</div>
      ${band()}</div>`;
  },
  trust(w, ps) {
    return `<div class="s">${head('LUMIA Care')}<h1>${hx(w.title || 'أصلية من ألمانيا… إلى باب البيت')}</h1>
      <div class="facts"><div class="fact"><i class="ic">✓</i>منتجات أصلية مختومة، من ألمانيا مباشرة</div>
      <div class="fact"><i class="ic">⟶</i>التوصيل لجميع المحافظات خلال 2 إلى 5 أيام عمل</div>
      <div class="fact"><i class="ic">◎</i>الدفع عند الاستلام، أو InstaPay والمحافظ الإلكترونية</div></div>
      <div class="row3">${ps.slice(0, 3).map(p => `<div><img src="${hx(p.image)}"></div>`).join('')}</div>${band()}</div>`;
  },
  reelScene(line, img, k) {
    const zoom = k % 2 ? 'transform:scale(1.04)' : '';
    return `<div class="s tall">${head('')}<div class="card" style="top:380px;height:760px"><img src="${hx(img)}" style="${zoom}"></div><div class="line">${hx(line)}</div></div>`;
  }
};

/* which pages a post has */
function pagesFor(item, w, ps, d) {
  const by = Object.fromEntries(ps.map(p => [p.id, p]));
  const chosen = (w.chosen && w.chosen.length ? w.chosen : item.products).map(id => by[id]).filter(Boolean);
  if (item.type === 'spotlight' || item.type === 'offer') {
    const chip = item.occasion ? `بمناسبة ${item.occasion.ar}` : item.type === 'offer' ? 'اختيار الأسبوع' : 'أصلي من ألمانيا';
    return { feed: [T.spotlight(w, ps, { chip })], story: T.spotlight(w, ps, { chip, tall: true }), used: ps };
  }
  if (item.type === 'compare') { const two = chosen.slice(0, 2); return { feed: [T.compare(w, two)], used: two }; }
  if (item.type === 'routine') {
    const ids = (w.steps || []).map(s => s.id).filter(id => by[id]);
    return { feed: [T.routine(w, ps), T.cta(d)], used: ids.map(id => by[id]) };
  }
  if (item.type === 'guide') {
    const slides = (w.slides || []).filter(s => by[s.id]).slice(0, 3), n = slides.length + 2;
    const used = slides.map(s => by[s.id]);
    return { feed: [T.guideCover(w, used, n), ...slides.map((s, i) => T.guideSlide(s, by[s.id], i + 1, n)), T.cta(d, n - 1, n)], used };
  }
  if (item.type === 'trust') return { feed: [T.trust(w, ps)], used: ps };
  if (item.type === 'reel') {
    const p = ps[0], imgs = [p.image, ...(p.images || []).filter(x => x !== p.image)].slice(0, 3);
    const lines = (w.lines && w.lines.length ? w.lines : [nm(p)]).slice(0, 3);
    return { scenes: lines.map((l, k) => T.reelScene(l, imgs[k % imgs.length], k)), end: T.cta(d), cover: T.spotlight({ headline: lines[0], chips: [] }, [p], { tall: true }), used: [p] };
  }
  throw new Error('unknown type ' + item.type);
}

const wrap = (inner, siteDir, tall) => `<!doctype html><html><head><meta charset="utf-8"><base href="${pathToFileURL(siteDir + '/').href}">
<link rel="stylesheet" href="${FONT_CSS}"><style>${CSS}${tall ? '.s{height:1920px}' : ''}</style></head><body>${inner}</body></html>`;

async function shoot(browser, html, file, siteDir, tall) {
  const page = await browser.newPage({ viewport: { width: 1080, height: tall ? 1920 : 1350 } });
  // drawn from a file next to the website's files, so the product photos (local files) are allowed to load
  const tmp = path.join(siteDir, `.render-${process.pid}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmp, wrap(html, siteDir, tall));
  try { await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' }); } finally { try { fs.unlinkSync(tmp); } catch (e) { /* gone */ } }
  const broken = await page.evaluate(() => [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.getAttribute('src')));
  if (broken.length) throw new Error('Picture missing: ' + broken.join(', '));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: file, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: 1080, height: tall ? 1920 : 1350 } });
  await page.close();
}

/* Reel: each scene 3.2 s with a slow zoom, soft fades, logo ending; silent (Instagram's own music can't be added by API) */
function makeReel(stills, out) {
  const dur = 3.2, fade = 0.5, fps = 30, args = ['-y'];
  stills.forEach(f => args.push('-i', f));   // one picture per scene; zoompan makes the frames
  const parts = stills.map((_, i) => `[${i}:v]scale=1188:2112,zoompan=z='min(zoom+0.0009,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(dur * fps)}:s=1080x1920:fps=${fps},setsar=1,format=yuv420p[v${i}]`);
  let last = 'v0', off = dur - fade;
  for (let i = 1; i < stills.length; i++) { parts.push(`[${last}][v${i}]xfade=transition=fade:duration=${fade}:offset=${off.toFixed(2)}[x${i}]`); last = `x${i}`; off += dur - fade; }
  args.push('-filter_complex', parts.join(';'), '-map', `[${last}]`, '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', '-an', out);
  execFileSync('ffmpeg', args, { stdio: 'ignore' });
}

/* renders all pictures (and the Reel) of a post into outDir; returns relative file names */
async function renderPost({ item, words, products, data, siteDir, outDir, browser }) {
  fs.mkdirSync(outDir, { recursive: true });
  const d = { waText: '+' + String(data.whatsapp || '').replace(/^(\d{2})(\d{2})(\d{4})(\d+)$/, '$1 $2 $3 $4'), site: (process.env.SITE_URL || 'https://lumia-store.github.io/').replace(/^https?:\/\//, '').replace(/\/$/, '') };
  const pg = pagesFor(item, words, products, d), files = { images: [], used: pg.used.map(p => p.id) };
  const base = item.id;
  if (pg.feed) for (let i = 0; i < pg.feed.length; i++) { const f = `${base}-${i + 1}.jpg`; await shoot(browser, pg.feed[i], path.join(outDir, f), siteDir, false); files.images.push(f); }
  if (pg.story) { const f = `${base}-story.jpg`; await shoot(browser, pg.story, path.join(outDir, f), siteDir, true); files.story = f; }
  if (pg.scenes) {
    const stills = [];
    for (let i = 0; i < pg.scenes.length; i++) { const f = path.join(outDir, `${base}-s${i}.jpg`); await shoot(browser, pg.scenes[i], f, siteDir, true); stills.push(f); }
    const endF = path.join(outDir, `${base}-end.jpg`); await shoot(browser, pg.end.replace('class="s"', 'class="s tall"'), endF, siteDir, true); stills.push(endF);
    const cover = `${base}-cover.jpg`; await shoot(browser, pg.cover, path.join(outDir, cover), siteDir, true);
    makeReel(stills, path.join(outDir, `${base}.mp4`));
    stills.forEach(f => fs.unlinkSync(f));
    files.video = `${base}.mp4`; files.cover = cover; files.images.push(cover);
  }
  return files;
}

module.exports = { renderPost, pagesFor, makeReel };
