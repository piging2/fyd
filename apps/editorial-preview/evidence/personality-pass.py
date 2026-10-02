from pathlib import Path
root=Path(__file__).resolve().parents[3]
p=root/"src/fyd/sitespec/types.ts";s=p.read_text().replace('  eyebrow?: string;','  heroEdition?: string;\n  heroNote?: string;\n  heroSeal?: string;\n  eyebrow?: string;',1);p.write_text(s)
p=root/"src/fyd/components/editorial-sections.tsx";s=p.read_text().replace('<span className="pl-hero-edition">A system in the making. A different way to think.</span>','{intent.heroEdition && <span className="pl-hero-edition">{intent.heroEdition}</span>}')
s=s.replace('<p className="pl-caption">For people building businesses. And the agents working with them.</p>','{intent.heroNote && <p className="pl-caption">{intent.heroNote}</p>}')
s=s.replace('        <div className="ed-hero-bottom">','''        {intent.heroSeal && <a className="pl-hero-seal" href={editorialHref(actions[1]?.href,intent.sourceOrigin)} aria-label={intent.heroSeal}>
          <svg viewBox="0 0 250 250" aria-hidden="true"><circle cx="125" cy="125" r="107" fill="none" stroke="currentColor" strokeWidth="1"/><circle cx="125" cy="125" r="82" fill="var(--cyan)"/><g className="pl-seal-spokes" stroke="var(--ink)" strokeWidth="16"><path d="M125 68V182M68 125H182M85 85L165 165M85 165L165 85"/></g><circle cx="125" cy="125" r="24" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="3"/><circle cx="125" cy="18" r="10" fill="var(--coral)" stroke="var(--ink)"/><circle cx="218" cy="179" r="10" fill="var(--violet)" stroke="var(--ink)"/><circle cx="32" cy="179" r="10" fill="var(--yellow)" stroke="var(--ink)"/></svg>
          <span>{intent.heroSeal}</span><small>Follow the thread ↗</small>
        </a>}
        <div className="ed-hero-bottom">''')
s=s.replace('.slice(0,3).map((r, i)', '.map((r, i)')
s=s.replace('<a className="ed-text-link pl-journal-more" href="/blog">Read the whole journal <span aria-hidden="true">↗</span></a>','{actions.map(a=><a key={a.href} className="ed-text-link pl-journal-more" href={editorialHref(a.href,intent.sourceOrigin)}>{a.label}<span aria-hidden="true">↗</span></a>)}')
p.write_text(s)
p=root/"apps/editorial-preview/presentation.ts";s=p.read_text().replace('wordmark:"PING",previewEndpoint:', 'wordmark:"PING",heroEdition:"For the beautifully complicated business of being a business.",heroNote:"New conversation. Same business. Keep the thread.",heroSeal:"Every hello has a history.",previewEndpoint:',1)
s=s.replace('You know more\\nthan your tools do.', 'Your business knows.\\nYour tools forget.')
s=s.replace('A system that remembers.\\nPeople who care.', 'Serious about the work.\\nHuman about the rest.')
s=s.replace('items:primitives.filter(p=>["events","evidence","identity","missions","workers","capabilities","replay","knowledge"].includes(p.id))','items:primitives.filter(p=>["events","evidence","identity","missions","workers","capabilities","replay","knowledge"].includes(p.id)).map(p=>({...p,source:"/docs#"+p.id}))')
p.write_text(s)
p=root/"src/fyd/components/editorial-learning.tsx";s=p.read_text().replace('href={"/docs#"+item.id}','href={item.source}');p.write_text(s)
p=root/"apps/editorial-preview/app/public-design.css";s=p.read_text();s+="""
/* Personality: a memorable continuity mark, lively interactions, cleaner editorial rhythm. */
.ed-wordmark{font-size:clamp(150px,29vw,490px);letter-spacing:-.052em;font-weight:880}
.pl-hero-seal{position:absolute;right:calc(var(--gutter) + 12px);top:100px;width:clamp(190px,19vw,280px);display:flex;flex-direction:column;align-items:center;text-align:center;transform:rotate(8deg);color:var(--ink)}
.pl-hero-seal svg{width:100%;height:auto;overflow:visible}
.pl-hero-seal>span{font-size:clamp(15px,1.3vw,21px);font-weight:650;line-height:1.2;max-width:15ch;margin-top:5px}
.pl-hero-seal>small{font-size:11px;margin-top:9px;font-weight:500}
.pl-hero-seal:hover{text-decoration:none}.pl-seal-spokes{transform-origin:125px 125px;transition:transform .6s cubic-bezier(.22,.68,0,1)}.pl-hero-seal:hover .pl-seal-spokes,.pl-hero-seal:focus-visible .pl-seal-spokes{transform:rotate(90deg)}
.pl-learning-problem .ed-intro{display:block}
.ed-publications{display:block}.ed-publications .ed-intro{display:grid;grid-template-columns:1fr 1fr;gap:0 50px}.ed-publications .ed-intro>.ed-label{grid-column:1/-1}.ed-publications .ed-intro .ed-copy{margin-top:0}
.ed-publication-list{grid-template-columns:repeat(4,minmax(0,1fr))}.ed-publication-list h3{font-size:25px}.ed-publication-list article>div:last-child{padding:23px}.ed-publication-list .pl-journal-art{height:210px}
.ed-publication-list .pl-journal-art-3{background:var(--yellow)}.pl-journal-art-3 span{transform:rotate(15deg)}
.pl-fragment{transition:transform .3s}.pl-fragment:hover{transform:rotate(0deg) translateY(-4px)}
.pl-audiences article{transition:transform .25s,box-shadow .25s}.pl-audiences article:hover{transform:translateY(-5px);box-shadow:0 14px 20px #14180e12}
.pl-audience-mark{transition:transform .3s;transform-origin:80% 60%}.pl-audiences article:hover .pl-audience-mark{transform:rotate(-12deg)}
.pl-journal-art span{transition:transform .35s}.ed-publication-list article:hover .pl-journal-art span,.journal-grid article:hover .pl-journal-art span{transform:rotate(0) scale(1.08)}
.ed-logo span{background:var(--yellow);color:var(--ink);transform:rotate(-5deg);transition:transform .2s}.ed-logo:hover span{transform:rotate(5deg)}
.pl-product-grid article:first-child{background:#edf5f4}.pl-product-grid article:nth-child(2){background:#f8f8f2}
@media(max-width:1200px){.ed-publication-list{grid-template-columns:1fr 1fr}.pl-hero-seal{right:calc(var(--gutter) + 10px);top:110px;width:180px}}
@media(max-width:900px){.pl-hero-seal{width:150px;top:92px;right:var(--gutter)}.pl-hero-seal>span{font-size:13px}.pl-hero-seal>small{font-size:10px}.ed-wordmark{font-size:28vw}}
@media(max-width:767px){.ed-wordmark{font-size:41.8vw;letter-spacing:-.055em;line-height:.85}.pl-hero-seal{display:none}.ed-hero-bottom h1{font-size:clamp(43px,9.5vw,70px)}.pl-object-margins{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;overflow:visible;padding:4px 0 32px;margin:0 0 5px;min-height:104px}.pl-margin-object{position:relative;justify-self:center;max-width:56px;width:100%;height:auto;aspect-ratio:1}.pl-object-label{width:100%;max-width:none;font-size:9px;top:calc(100% + 8px);overflow-wrap:normal}.pl-object-dot{right:-1px}.ed-publications .ed-intro{display:block}.ed-publications .ed-intro .ed-copy{margin-top:18px}.ed-publication-list{grid-template-columns:1fr}.ed-publication-list h3{font-size:28px}.pl-hero-edition{display:none}}
@media(prefers-reduced-motion:reduce){.pl-seal-spokes,.pl-fragment,.pl-audiences article,.pl-journal-art span,.pl-audience-mark{transition:none!important}.pl-audiences article:hover,.pl-fragment:hover{transform:none}}
"""
p.write_text(s)
