/**
 * LUMIA social robot — draws the post pictures (JPEG, 1080×1350 for the feed, 1080×1920 for Stories and Reels)
 * from brand templates, and makes the Reel video with ffmpeg.
 * Colours and fonts are the website's own (logo palette).
 */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const HERO = require('./hero.js');

const FONT_CSS = process.env.FONT_CSS || 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cormorant+Garamond:wght@400;500;600&family=Montserrat:wght@300;400;500;600&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600&display=swap';
const hx = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nm = p => p.nameAr || p.nameEn || p.name;

/* Premium editorial design (Nov 2026): warm ivory paper, an arch behind each product, products "standing" on a plinth
   (their white photo background melts into the paper), champagne-gold hairlines, Amiri headlines, tracked small capitals. */
const CSS = `
:root{--paper:#f6efe9;--paper2:#fbf8f5;--arch:#ecdfd6;--arch2:#e4d3c8;--ink:#33201d;--cocoa:#4a2c28;--taupe:#8c7268;--muted:#7d6a64;--gold:#b47b62;--gold2:#e2c3b2}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"IBM Plex Sans Arabic",sans-serif;color:var(--ink);background:var(--paper)}
.s{width:1080px;height:1350px;position:relative;overflow:hidden;direction:rtl;
  background:radial-gradient(120% 80% at 50% 38%,var(--paper2) 0%,var(--paper) 55%,#efe5dd 100%)}
.s.tall{height:1920px}
.frame{position:absolute;inset:34px;border:1.5px solid var(--gold2);pointer-events:none;z-index:5}
.frame:after{content:"";position:absolute;inset:8px;border:1px solid rgba(216,192,161,.45)}
/* header: small caps left/right, logo centred */
.hd{position:absolute;top:74px;left:86px;right:86px;display:grid;grid-template-columns:minmax(0,1fr) 200px minmax(0,1fr);align-items:center;z-index:4}
.hd .logo{justify-self:center}.hd .cap{overflow:hidden;text-overflow:clip}
.hd .cap:first-child{justify-self:start;text-align:right}.hd .cap:last-child{justify-self:end;text-align:left}
.tall .hd{top:150px}
.cap{font-family:Montserrat;font-weight:500;font-size:18px;letter-spacing:.24em;color:#7a6058;text-transform:uppercase;direction:ltr;white-space:nowrap}
.logo{display:flex;flex-direction:column;align-items:center;gap:6px;direction:ltr}
.logo img{width:64px;height:64px}
.logo b{font-family:"Cormorant Garamond",serif;font-weight:500;font-size:34px;letter-spacing:.5em;padding-left:.5em;color:var(--cocoa);line-height:1}
.logo i{font-style:normal;font-family:Montserrat;font-size:12px;letter-spacing:.7em;padding-left:.7em;color:var(--taupe)}
/* type */
.kick{display:flex;align-items:center;justify-content:center;gap:18px;font-family:Montserrat;font-weight:500;font-size:20px;letter-spacing:.34em;color:var(--gold);direction:ltr;text-transform:uppercase}
.kick:before,.kick:after{content:"";width:60px;height:1px;background:var(--gold2)}
.kick.ar{font-family:"IBM Plex Sans Arabic";letter-spacing:0;font-size:26px;font-weight:400;direction:rtl;text-transform:none}
h1{font-family:"Amiri",serif;font-weight:700;color:var(--cocoa);text-align:center;font-size:82px;line-height:1.32;padding:0 120px}
h1.m{font-size:68px}h1.s2{font-size:58px}
.sub{font-family:"IBM Plex Sans Arabic";font-weight:300;font-size:31px;color:var(--muted);text-align:center;line-height:1.55;padding:0 140px}
.lat{font-family:Montserrat;font-weight:400;direction:ltr;unicode-bidi:isolate}
.pname{text-align:center;font-size:28px;color:var(--muted);font-weight:300}
.pname .lat{font-weight:500;letter-spacing:.12em;text-transform:uppercase;font-size:20px;color:var(--cocoa)}
/* the stage: arch + product + plinth */
.stage{position:absolute}
.arch{position:absolute;inset:0;border-radius:999px 999px 0 0;background:linear-gradient(180deg,var(--arch) 0%,var(--arch2) 100%)}
.arch:after{content:"";position:absolute;inset:18px 18px 0;border-radius:999px 999px 0 0;border:1px solid rgba(184,148,108,.35);border-bottom:0}
.prod{position:absolute;left:8%;right:8%;bottom:7%;top:12%;display:flex;align-items:flex-end;justify-content:center}
.prod img{max-width:100%;max-height:100%;object-fit:contain;mix-blend-mode:multiply;filter:contrast(1.02) saturate(1.02)}
.floor{position:absolute;bottom:-1px;left:-60px;right:-60px;height:2px;background:linear-gradient(90deg,transparent,var(--gold) 15%,var(--gold) 85%,transparent)}
.shadow{position:absolute;bottom:4%;left:22%;right:22%;height:34px;border-radius:50%;background:radial-gradient(closest-side,rgba(74,44,40,.22),transparent);filter:blur(4px)}
/* facts: a quiet row with gold dots */
.facts{display:flex;justify-content:center;align-items:center;gap:22px;flex-wrap:wrap;font-size:29px;color:var(--cocoa);font-weight:400;padding:0 110px;text-align:center}
.facts span+span:before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--gold);margin-left:22px;vertical-align:middle}
/* footer */
.ft{position:absolute;bottom:72px;left:86px;right:86px;text-align:center;z-index:4}
.tall .ft{bottom:200px}
.ft .rule{height:1px;background:linear-gradient(90deg,transparent,var(--gold2),transparent);margin-bottom:22px}
.ft p{font-size:23px;color:var(--muted);font-weight:300;letter-spacing:.02em}
.ft p .lat{font-size:18px;letter-spacing:.28em;color:var(--taupe);text-transform:uppercase}
.ft p em{font-style:normal;color:var(--gold);padding:0 12px}
/* numbers */
.no{font-family:"Cormorant Garamond",serif;font-weight:400;color:var(--gold);direction:ltr;line-height:1}
/* compare */
.duo{position:absolute;top:470px;left:90px;right:90px;height:590px;display:flex;justify-content:space-between}
.duo .one{width:400px;position:relative}
.duo .one .stage{width:400px;height:520px;top:0}
.duo .one p{position:absolute;top:545px;left:0;right:0;text-align:center;font-family:Amiri;font-size:36px;color:var(--cocoa);line-height:1.3}
.duo .one small{display:block;font-family:Montserrat;font-size:17px;letter-spacing:.28em;color:var(--taupe);text-transform:uppercase;margin-top:6px}
.or{position:absolute;top:690px;left:50%;transform:translateX(-50%);font-family:Amiri;font-size:56px;color:var(--gold);z-index:3}
/* routine */
.steps{position:absolute;left:96px;right:96px;display:flex;flex-direction:column}
.flow{position:absolute;top:212px;left:0;right:0;bottom:170px;display:flex;flex-direction:column;align-items:stretch;gap:26px}
.flow .steps,.flow .pillars{position:static;margin:0 96px}
.flow .grow{flex:1;position:relative}
.step{display:flex;align-items:center;gap:34px;padding:18px 0;border-bottom:1px solid var(--gold2)}
.step:first-child{border-top:1px solid var(--gold2)}
.step .no{font-size:92px;width:90px;text-align:center;flex:none}
.step .ph{width:170px;height:180px;flex:none;position:relative;border-radius:999px 999px 0 0;background:linear-gradient(180deg,var(--arch),var(--arch2));overflow:hidden}
.step .ph img{position:absolute;left:10%;right:10%;bottom:6%;top:10%;width:80%;height:84%;object-fit:contain;mix-blend-mode:multiply}
.step h3{font-family:Amiri;font-weight:400;font-size:44px;color:var(--cocoa);line-height:1.25}
.step p{font-size:26px;font-weight:300;color:var(--muted);line-height:1.45;margin-top:4px}
.step small{display:block;font-family:Montserrat;font-size:16px;letter-spacing:.28em;color:var(--taupe);text-transform:uppercase;margin-top:8px;direction:ltr;text-align:right}
/* guide slide */
.pts{list-style:none;padding:0 120px}
.pts li{font-size:33px;font-weight:300;line-height:1.5;padding:16px 0;border-bottom:1px solid rgba(216,192,161,.7);color:var(--ink);display:flex;gap:20px;align-items:baseline}
.pts li:before{content:"";flex:none;width:9px;height:9px;transform:rotate(45deg) translateY(-4px);background:var(--gold)}
/* trust */
.pillars{position:absolute;left:96px;right:96px;display:flex;gap:0}
.pillar{flex:1;text-align:center;padding:10px 26px}
.pillar+.pillar{border-right:1px solid var(--gold2)}
.pillar svg{width:64px;height:64px;stroke:var(--gold);fill:none;stroke-width:1.6}
.pillar h4{font-family:Amiri;font-weight:400;font-size:34px;white-space:nowrap;color:var(--cocoa);margin-top:14px;line-height:1.3}
.pillar p{font-size:24px;font-weight:300;color:var(--muted);line-height:1.5;margin-top:8px}
.shelf{position:absolute;left:120px;right:120px;display:flex;justify-content:center;align-items:flex-end;gap:40px}
.shelf img{height:300px;max-width:260px;object-fit:contain;mix-blend-mode:multiply}
/* end card */
.end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:30px;z-index:4}
.end .mark{width:420px}
.end h2{font-family:Amiri;font-weight:400;font-size:62px;color:var(--cocoa)}
.end .links{display:flex;flex-direction:column;gap:18px;align-items:center}
.end .lk{border:1.5px solid var(--gold);border-radius:60px;padding:16px 46px;font-family:Montserrat;font-size:30px;letter-spacing:.06em;color:var(--cocoa);direction:ltr;min-width:520px}
.end .lk small{display:block;font-family:"IBM Plex Sans Arabic";font-size:20px;letter-spacing:0;color:var(--taupe);margin-bottom:2px}
.end p{font-size:26px;font-weight:300;color:var(--muted);line-height:1.7}
/* reel line */
.line{position:absolute;left:100px;right:100px;font-family:Amiri;font-weight:400;font-size:86px;line-height:1.3;color:var(--cocoa);text-align:center}
`;

const frame = '<div class="frame"></div>';
const head = (left, right) => `<div class="hd"><span class="cap">${hx(left || 'From Germany')}</span><div class="logo"><img src="logo-mark.png"><b>LUMIA</b><i>CARE</i></div><span class="cap">${hx(right || 'Original')}</span></div>`;
const foot = () => `<div class="ft"><div class="rule"></div><p>التوصيل لجميع المحافظات<em>·</em>الدفع عند الاستلام</p></div>`;
const stage = (img, { top, w, h, left }) => `<div class="stage" style="top:${top}px;left:${left == null ? (1080 - w) / 2 : left}px;width:${w}px;height:${h}px"><div class="arch"></div><div class="shadow"></div><div class="prod"><img src="${hx(img)}"></div><div class="floor"></div></div>`;
const hClass = t => { const n = String(t || '').length; return n > 34 ? ' class="s2"' : n > 22 ? ' class="m"' : ''; };
const sizeTxt = p => p.size ? ` · <span class="lat">${hx(p.size)}</span>` : '';
const pname = p => `<div class="pname"><span class="lat">${hx(p.brand)}</span> · ${hx(nm(p))}${sizeTxt(p)}</div>`;
const pos = (top, html) => `<div style="position:absolute;top:${top}px;left:0;right:0">${html}</div>`;
const preChip = () => '';   // Mina: pictures never show stock or pre-order
const ICON = {
  seal: '<svg viewBox="0 0 64 64"><circle cx="32" cy="28" r="18"/><path d="M24 28l6 6 11-12"/><path d="M22 44l-4 14 14-6 14 6-4-14"/></svg>',
  van: '<svg viewBox="0 0 64 64"><path d="M6 18h32v26H6zM38 28h12l8 9v7H38z"/><circle cx="18" cy="48" r="5"/><circle cx="48" cy="48" r="5"/></svg>',
  hand: '<svg viewBox="0 0 64 64"><rect x="10" y="16" width="44" height="28" rx="4"/><path d="M10 26h44"/><circle cx="32" cy="36" r="4"/></svg>'
};

/* one page (slide) of a post → HTML */
const T = {
  spotlight(w, [p], o = {}) {
    const tall = !!o.tall, Y = tall ? 285 : 0;
    const headline = w.headline || nm(p);
    return `<div class="s${tall ? ' tall' : ''}">${frame}${head(o.left || 'From Germany', o.right || 'Original')}
      ${pos(220 + Y, o.chip ? `<div class="kick ar">${hx(o.chip)}</div>` : `<div class="kick">${hx(p.brand)}</div>`)}
      ${pos(262 + Y, `<h1${hClass(headline)}>${hx(headline)}</h1>`)}
      ${stage(p.image, { top: (tall ? 760 : 520), w: tall ? 640 : 560, h: tall ? 760 : 560 })}
      ${pos((tall ? 1560 : 1110), pname(p))}
      ${pos((tall ? 1625 : 1170), `<div class="facts">${(w.chips || []).slice(0, 3).map(c => `<span>${hx(c)}</span>`).join('')}</div>`)}
      ${foot()}</div>`;
  },
  compare(w, ps) {
    return `<div class="s">${frame}${head('The edit', 'From Germany')}
      ${pos(220, `<div class="kick">${hx(ps.map(p => p.brand).filter((b, i, a) => a.indexOf(b) === i).join(' · '))}</div>`)}
      ${pos(262, `<h1${hClass(w.title)}>${hx(w.title)}</h1>`)}${w.sub ? pos(380, `<div class="sub">${hx(w.sub)}</div>`) : ''}
      <div class="duo">${ps.map(p => `<div class="one">${stage(p.image, { top: 0, w: 400, h: 520, left: 0 })}<p>${hx((w.labels || {})[p.id] || nm(p))}<small>${hx(p.brand)}</small></p></div>`).join('')}</div>
      <div class="or">أم</div>${foot()}</div>`;
  },
  guideCover(w, ps, n) {
    const k = ps.slice(0, 3).length;
    return `<div class="s">${frame}${head('From Germany', 'The guide')}
      ${pos(220, `<div class="kick">Care guide</div>`)}
      ${pos(262, `<h1${hClass(w.title)}>${hx(w.title)}</h1>`)}${w.sub ? pos(400, `<div class="sub">${hx(w.sub)}</div>`) : ''}
      <div class="stage" style="top:540px;left:100px;width:880px;height:520px"><div class="arch" style="border-radius:440px 440px 0 0"></div>
        <div style="position:absolute;inset:16% 6% 6%;display:flex;align-items:flex-end;justify-content:center;gap:${k > 2 ? 26 : 60}px">${ps.slice(0, 3).map(p => `<img src="${hx(p.image)}" style="height:${k > 2 ? 330 : 380}px;max-width:${k > 2 ? 250 : 330}px;object-fit:contain;mix-blend-mode:multiply">`).join('')}</div>
        <div class="floor"></div></div>
      ${pos(1110, `<div class="cap" style="text-align:center">${hx([...new Set(ps.slice(0, 3).map(p => p.brand))].join('   ·   '))}</div>`)}
      ${foot()}</div>`;
  },
  guideSlide(sl, p, i, n) {
    return `<div class="s">${frame}${head('The guide', (i + 1) + ' / ' + n)}
      ${stage(p.image, { top: 235, w: 440, h: 440 })}
      ${pos(700, `<div class="no" style="text-align:center;font-size:84px">0${i}</div>`)}
      ${pos(790, `<h1 class="m">${hx(sl.title)}</h1>`)}
      ${pos(890, pname(p))}
      ${pos(945, `<ul class="pts">${(sl.points || []).slice(0, 3).map(x => `<li>${hx(x)}</li>`).join('')}</ul>`)}
      ${foot()}</div>`;
  },
  cta(d) {
    return `<div class="s">${frame}<div class="end"><img class="mark" src="logo-full.png">
      <h2>الطلب عبر الموقع أو واتساب</h2>
      <div class="links"><div class="lk"><small>واتساب</small>${hx(d.waText)}</div></div>
      <p>منتجات أصلية مستوردة من ألمانيا<br>التوصيل لجميع المحافظات · الدفع عند الاستلام</p></div></div>`;
  },
  routine(w, ps) {
    const by = Object.fromEntries(ps.map(p => [p.id, p]));
    const steps = (w.steps || []).filter(s => by[s.id]).slice(0, 3);
    return `<div class="s">${frame}${head('The ritual', 'From Germany')}
      <div class="flow">${w.when ? `<div class="kick ar">${hx(w.when)}</div>` : `<div class="kick">Routine</div>`}
      <h1${hClass(w.title)}>${hx(w.title)}</h1>
      <div class="steps">${steps.map((s, i) => { const p = by[s.id]; return `<div class="step"><div class="no">0${i + 1}</div><div class="ph"><img src="${hx(p.image)}"></div><div><h3>${hx(s.step)}</h3><p>${hx(s.why)}</p><small>${hx(p.brand)}</small></div></div>`; }).join('')}</div></div>
      ${foot()}</div>`;
  },
  trust(w, ps) {
    return `<div class="s">${frame}${head('Our promise', 'From Germany')}
      <div class="flow"><div class="kick">LUMIA Care</div>
      <h1 class="m">${hx(w.title || 'أصلية من ألمانيا… إلى باب البيت')}</h1>
      <div class="pillars">
        <div class="pillar">${ICON.seal}<h4>أصلية ومختومة</h4><p>من ألمانيا مباشرة إلى يديك</p></div>
        <div class="pillar">${ICON.van}<h4>لكل المحافظات</h4><p>التوصيل خلال 2 إلى 5 أيام عمل</p></div>
        <div class="pillar">${ICON.hand}<h4>الدفع عند الاستلام</h4><p>أو InstaPay والمحافظ الإلكترونية</p></div></div>
      <div class="grow"><div class="stage" style="left:100px;right:100px;width:auto;top:6%;bottom:0"><div class="arch" style="border-radius:440px 440px 0 0;opacity:.75"></div>
        <div style="position:absolute;inset:10% 4% 4%;display:flex;align-items:flex-end;justify-content:center;gap:40px">${ps.slice(0, 3).map(p => `<img src="${hx(p.image)}" style="height:100%;max-height:300px;max-width:250px;object-fit:contain;mix-blend-mode:multiply">`).join('')}</div>
        <div class="floor"></div></div></div></div>
      ${foot()}</div>`;
  },
  reelScene(line, img, k) {
    return `<div class="s tall">${frame}${head('Original', 'From Germany')}
      ${stage(img, { top: 380, w: 720, h: 860 })}
      <div class="line" style="top:1330px">${hx(line)}</div>${foot()}</div>`;
  }
};

/* the hero post (spotlight, offer, ad, story, reel cover): real product on a podium in a themed scene */
function heroOf(w, p, o, d) {
  const theme = HERO.themeOf(p), sc = d && d.siteDir ? HERO.sceneFor(d.siteDir, theme, (d.key || '') + p.id + (o.tall ? 't' : '')) : null;
  const scene = sc ? Object.assign({}, sc, { src: 'media/scenes/' + sc.file }) : null;
  return HERO.heroPage(w, p, Object.assign({}, o, { theme, scene }));
}

/* posts with several products, the end card and Reel scenes: the same scene + podium look (Mina, Nov 2026) */
function stageOf(o, ps, d, key) {
  const theme = o.theme || HERO.themeOf(ps[0] || {}), sc = d && d.siteDir ? HERO.sceneFor(d.siteDir, theme, (d.key || '') + key) : null;
  return HERO.stagePage(Object.assign({ theme, scene: sc ? Object.assign({}, sc, { src: 'media/scenes/' + sc.file }) : null }, o));
}
const ICO = HERO.icon, esc = hx;
const pnameLine = p => `<div style="text-align:center;font-size:27px;margin-bottom:6px"><span style="font-family:Montserrat;font-weight:500;letter-spacing:.14em;text-transform:uppercase;font-size:21px">${esc(p.brand)}</span> · ${esc(nm(p))}${p.size ? ` · <span style="font-family:Montserrat;font-size:21px">${esc(p.size)}</span>` : ''}</div>`;
const endCard = (d, key, tall) => stageOf({ tall, theme: 'blush', headline: 'الطلب عبر الموقع أو واتساب', items: ['logo-full.png'], noCut: true, darken: true, maxH: tall ? 420 : 300, target: tall ? 1180 : 880,
  cardHtml: `<div style="text-align:center"><div class="wa2"><small style="display:block;font-family:'IBM Plex Sans Arabic';font-size:20px;letter-spacing:0;opacity:.75">واتساب</small>${esc(d.waText)}</div>
    <div style="font-size:26px;margin-top:16px;line-height:1.6">منتجات أصلية مستوردة من ألمانيا<br>التوصيل لجميع المحافظات · الدفع عند الاستلام</div></div>`, card: tall ? [1360, 1640] : [1030, 1280] }, [], d, key + '-end');

/* which pages a post has */
function pagesFor(item, w, ps, d) {
  const by = Object.fromEntries(ps.map(p => [p.id, p]));
  const chosen = (w.chosen && w.chosen.length ? w.chosen : item.products).map(id => by[id]).filter(Boolean);
  if (item.type === 'spotlight' || item.type === 'offer') {
    const chip = item.occasion ? `بمناسبة ${item.occasion.ar}` : item.type === 'offer' ? 'اختيار الأسبوع' : 'أصلي من ألمانيا';
    return { feed: [heroOf(w, ps[0], { chip }, d)], story: heroOf(w, ps[0], { chip, tall: true }, d), used: ps };
  }
  if (item.type === 'compare') {
    const two = chosen.slice(0, 2);
    return { feed: [stageOf({ kick: 'أيهما يناسبك؟', headline: w.title, sub: w.sub, items: two.map(p => p.image), over: 'أم', target: 880,
      cardHtml: `<div class="cols">${two.map(p => `<div><h4>${esc((w.labels || {})[p.id] || nm(p))}</h4><span class="lat">${esc(p.brand)}</span><p>${esc(nm(p))}</p></div>`).join('')}</div>`, card: [1035, 1245] }, two, d, 'c')], used: two };
  }
  if (item.type === 'routine') {
    const steps = (w.steps || []).filter(x => by[x.id]).slice(0, 3), sp = steps.map(x => by[x.id]);
    return { feed: [stageOf({ kick: w.when || 'روتين العناية', headline: w.title, items: sp.map(p => p.image), badges: true, target: 760,
      cardHtml: `<div class="rows">${steps.map((x, i) => `<div class="rw"><div class="n">0${i + 1}</div><div><b>${esc(x.step)}</b><span>${esc(x.why)}</span></div></div>`).join('')}</div>`, card: [940, 1270] }, sp, d, 'r'), endCard(d, 'r')], used: sp };
  }
  if (item.type === 'guide') {
    const slides = (w.slides || []).filter(x => by[x.id]).slice(0, 3), used = slides.map(x => by[x.id]), n = slides.length + 2;
    const cover = stageOf({ kick: 'دليل العناية', headline: w.title, items: used.map(p => p.image), target: 880,
      cardHtml: `<div style="text-align:center;font-size:30px;line-height:1.5">${esc(w.sub || '')}</div><div style="text-align:center;font-family:Montserrat;font-size:19px;letter-spacing:.3em;margin-top:14px;opacity:.8">${esc([...new Set(used.map(p => p.brand))].join('  ·  ').toUpperCase())}</div>`, card: [1045, 1215] }, used, d, 'g0');
    const pages = slides.map((x, i) => stageOf({ kick: `الخطوة ${i + 1} من ${slides.length}`, headline: x.title, items: [by[x.id].image], target: 800,
      cardHtml: `${pnameLine(by[x.id])}<ul class="pts2">${(x.points || []).slice(0, 3).map(t => `<li>${esc(t)}</li>`).join('')}</ul>`, card: [955, 1275] }, [by[x.id]], d, 'g' + (i + 1)));
    return { feed: [cover, ...pages, endCard(d, 'g')], used };
  }
  if (item.type === 'trust') {
    const three = ps.slice(0, 3);
    const P3 = [['shield', 'أصلية ومختومة', 'من ألمانيا مباشرة إلى يديك'], ['spark', 'لكل المحافظات', 'التوصيل خلال 2 إلى 5 أيام عمل'], ['lotus', 'الدفع عند الاستلام', 'أو InstaPay والمحافظ الإلكترونية']];
    return { feed: [stageOf({ kick: 'LUMIA Care', headline: w.title || 'أصلية من ألمانيا… إلى باب البيت', items: three.map(p => p.image), target: 820,
      cardHtml: `<div class="cols">${P3.map(([ic, h, t]) => `<div><div class="ic">${ICO(ic)}</div><h4>${h}</h4><p>${t}</p></div>`).join('')}</div>`, card: [995, 1255] }, three, d, 't')], used: three };
  }
  if (item.type === 'reel') {
    const p = ps[0];
    const lines = (w.lines && w.lines.length ? w.lines : [nm(p)]).slice(0, 3);
    return { scenes: lines.map((l, k) => stageOf({ tall: true, headline: l, items: [p.image], cardHtml: pnameLine(p) + `<div style="text-align:center;font-size:26px;margin-top:8px">التوصيل لجميع المحافظات · الدفع عند الاستلام</div>`, card: [1400, 1560] }, [p], d, 'reel')),
      end: endCard(d, 'reel', true), cover: heroOf({ headline: lines[0], chips: w.chips || [] }, p, { tall: true }, d), used: [p] };
  }
  throw new Error('unknown type ' + item.type);
}

const wrap = (inner, siteDir, tall) => `<!doctype html><html><head><meta charset="utf-8"><base href="${pathToFileURL(siteDir + '/').href}">
<link rel="stylesheet" href="${FONT_CSS}"><style>${CSS}${HERO.CSS}${tall ? '.s{height:1920px}' : ''}</style></head><body>${inner}</body></html>`;

async function shoot(browser, html, file, siteDir, tall) {
  const page = await browser.newPage({ viewport: { width: 1080, height: tall ? 1920 : 1350 } });
  // drawn from a file next to the website's files, so the product photos (local files) are allowed to load
  const tmp = path.join(siteDir, `.render-${process.pid}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmp, wrap(html, siteDir, tall));
  try { await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' }); } finally { try { fs.unlinkSync(tmp); } catch (e) { /* gone */ } }
  const broken = await page.evaluate(() => [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => String(i.getAttribute('src')).slice(0, 80)));
  if (broken.length) throw new Error('Picture missing: ' + broken.join(', '));
  await page.evaluate(HERO.CUTOUT_JS.startsWith('async') ? eval(HERO.CUTOUT_JS) : () => true);   // product photos cut out of their white background
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
  // product photos go in as data (not file links), so the page may cut them out of their white background
  const asData = rel => { try { const f = path.join(siteDir, String(rel || '')); const ext = path.extname(f).slice(1).toLowerCase(); return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + fs.readFileSync(f).toString('base64'); } catch (e) { return rel; } };
  products = products.map(p => Object.assign({}, p, { image: asData(p.image), images: (p.images || []).map(asData) }));
  const d = { siteDir, key: item.id, waText: '+' + String(data.whatsapp || '').replace(/^(\d{2})(\d{2})(\d{4})(\d+)$/, '$1 $2 $3 $4'), site: (process.env.SITE_URL || 'https://lumia-store.github.io/').replace(/^https?:\/\//, '').replace(/\/$/, '') };
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

module.exports = { renderPost, pagesFor, makeReel, CSS };
