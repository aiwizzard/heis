# Requires fonttools and brotli in a Python environment.
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
root=Path(__file__).resolve().parents[1] / 'public' / 'brand';root.mkdir(exist_ok=True)
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
f=TTFont(str(root.parent/'fonts/dm-sans-latin.woff2'))
f=instantiateVariableFont(f,{'wght':560},inplace=False)
gs=f.getGlyphSet(); cmap=f.getBestCmap()
def lettering(text):
 paths=[]; x=0; bounds=BoundsPen(gs)
 for ch in text:
  name=cmap[ord(ch)]; pen=SVGPathPen(gs); gs[name].draw(pen)
  gs[name].draw(TransformPen(bounds,(1,0,0,1,x,0)))
  paths.append(f'<path transform="translate({x} 0)" d="{pen.getCommands()}"/>')
  x+=f['hmtx'][name][0]-25
 return ''.join(paths), bounds.bounds
full, box=lettering('heis')
scale=76/(box[3]-box[1])
baseline=88+box[1]*scale
mark='M16 12H32V44L64 32V12H80L88 20V80L80 88H64V56L32 68V88H16L8 80V20Z'
def word(text,left=0):
 paths,bounds=lettering(text)
 return f'<g transform="translate({left-bounds[0]*scale:.4f} {baseline:.4f}) scale({scale:.6f} {-scale:.6f})">{paths}</g>', (bounds[2]-bounds[0])*scale

def svg(name,w,h,body,label):
 (root/name).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.3f} {h}" role="img" aria-label="{label}">{body}</svg>\n')

def lockup(name,text,color,symbol_color=None,gap=16):
 letters,width=word(text,88+gap)
 svg(name,88+gap+width+8,100,f'<path fill="{symbol_color or color}" d="{mark}"/><g fill="{color}">{letters}</g>','Heis')

for name,color in [('crimson','#ac2430'),('ivory','#f5eee6'),('black','#101113')]:
 svg(f'heis-symbol-{name}.svg',96,100,f'<path fill="{color}" d="{mark}"/>','Heis sculpted H')
 letters,width=word('heis',8)
 svg(f'heis-wordmark-{name}.svg',width+16,100,f'<g fill="{color}">{letters}</g>','heis')
 lockup(f'heis-lockup-{name}.svg','heis',color)
 lockup(f'heis-integrated-{name}.svg','eis',color,gap=8)
lockup('heis-lockup.svg','heis','#f5eee6','#ac2430')
lockup('heis-integrated.svg','eis','#f5eee6','#ac2430',gap=8)
svg('heis-app-icon.svg',512,512,f'<rect width="512" height="512" rx="112" fill="#101113"/><g transform="translate(88 81) scale(3.5)"><path fill="#ac2430" d="{mark}"/></g>','Heis app icon')
svg('heis-app-icon-crimson.svg',512,512,f'<rect width="512" height="512" rx="112" fill="#ac2430"/><g transform="translate(88 81) scale(3.5)"><path fill="#f5eee6" d="{mark}"/></g>','Heis app icon in crimson')
(root/'preview.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><title>Heis | Identity</title><style>
@font-face{font-family:DM;src:url('../fonts/dm-sans-latin.woff2')}*{box-sizing:border-box}body{margin:0;background:#101113;color:#f5eee6;font:14px DM,sans-serif}.sheet{width:1440px;padding:52px 64px 40px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #ffffff20;padding-bottom:24px}header strong{font-size:18px;font-weight:500}small{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#aaa4a1}.hero{height:450px;display:grid;grid-template-columns:1.5fr 1fr;align-items:center;gap:96px}.hero-logo{width:460px;max-height:155px}.hero p{color:#a7a1a0;font-size:16px;margin-top:38px;line-height:1.6;max-width:420px}.hero-icon{width:240px;justify-self:center;filter:drop-shadow(0 24px 50px #0004)}.cards{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px}.card{height:244px;padding:26px;display:flex;flex-direction:column;justify-content:space-between;border-radius:12px;border:1px solid #ffffff16}.ivory{background:#f5eee6;color:#101113}.red{background:#ac2430}.card>img{height:65px;max-width:260px;align-self:center;margin:auto}.ivory small{color:#706962}.red small{color:#f5eee6b3}.sizes{display:flex;align-items:end;gap:25px;margin:auto}.sizes img{display:block}.size{text-align:center}.size span{display:block;font-size:10px;color:#aaa4a1;margin-top:12px}.footer{display:flex;justify-content:space-between;align-items:center;margin-top:36px;padding-top:24px;border-top:1px solid #ffffff20}.palette{display:flex;gap:24px;color:#aaa4a1;font-size:12px}.swatch{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px}.domain{font-size:20px;letter-spacing:-.5px}.caption{font-size:12px;color:#aaa4a1;margin-top:6px}
</style><div class="sheet"><header><strong>heis / visual identity</strong><small>Sculpted H · 02</small></header><section class="hero"><div><img class="hero-logo" src="heis-lockup.svg"/><p>A single cut. A connected form.<br>A mark for a complete creative workspace.</p></div><img class="hero-icon" src="heis-app-icon-crimson.svg"/></section><section class="cards"><div class="card ivory"><small>On warm ivory</small><img src="heis-lockup-black.svg"/><span>Clear in one color.</span></div><div class="card red"><small>On deep crimson</small><img src="heis-lockup-ivory.svg"/><span>Color carries the identity.</span></div><div class="card"><small>Small by design</small><div class="sizes"><div class="size"><img src="heis-symbol-ivory.svg" width="16"/><span>16</span></div><div class="size"><img src="heis-symbol-ivory.svg" width="24"/><span>24</span></div><div class="size"><img src="heis-symbol-ivory.svg" width="32"/><span>32</span></div><div class="size"><img src="heis-symbol-ivory.svg" width="48"/><span>48</span></div><div class="size"><img src="heis-symbol-ivory.svg" width="64"/><span>64</span></div></div><span>App icon, toolbar, and favicon.</span></div></section><div class="footer"><div><div class="domain">heis.studio</div><div class="caption">Proposed web address</div></div><div class="palette"><span><i class="swatch" style="background:#ac2430"></i>Crimson / AC2430</span><span><i class="swatch" style="background:#f5eee6"></i>Ivory / F5EEE6</span><span><i class="swatch" style="background:#292a2e"></i>Charcoal / 101113</span></div></div></div></html>''')

(root/'comparison.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><title>Heis logo refinements</title><style>
@font-face{font-family:DM;src:url('../fonts/dm-sans-latin.woff2')}*{box-sizing:border-box}body{margin:0;background:#101113;color:#f5eee6;font:14px DM,sans-serif}.sheet{width:1440px;padding:48px 60px}header{display:flex;justify-content:space-between;border-bottom:1px solid #ffffff20;padding-bottom:24px}small{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#aaa4a1}.grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:36px}.concept{border:1px solid #ffffff20;border-radius:12px;overflow:hidden}.label{padding:24px 28px;display:flex;justify-content:space-between}.main{height:270px;display:flex;align-items:center;justify-content:center}.main img{height:110px;max-width:90%}.caption{padding:0 28px 28px;color:#aaa4a1;line-height:1.6;min-height:78px}.ivory{background:#f5eee6;height:160px;display:flex;justify-content:center;align-items:center}.ivory img{height:58px}.small{height:130px;display:flex;align-items:center;justify-content:center;gap:40px}.small img{height:28px}.small img:last-child{height:40px}.footer{margin-top:28px;color:#aaa4a1;font-size:13px}strong{font-weight:500}</style><div class="sheet"><header><strong>heis / logo refinements</strong><small>Spacing, alignment, and an integrated alternative</small></header><div class="grid"><section class="concept"><div class="label"><strong>A / Refined lockup</strong><small>Icon + name</small></div><div class="main"><img src="heis-lockup.svg"/></div><div class="caption">Tighter spacing, shared vertical bounds.<br>The symbol and the full name remain separate.</div><div class="ivory"><img src="heis-lockup-black.svg"/></div><div class="small"><img src="heis-lockup-ivory.svg"/><img src="heis-lockup-ivory.svg"/></div></section><section class="concept"><div class="label"><strong>B / Integrated wordmark</strong><small>Icon becomes the H</small></div><div class="main"><img src="heis-integrated.svg"/></div><div class="caption">One H, one word. A more compact signature.<br>The symbol replaces the first letter of Heis.</div><div class="ivory"><img src="heis-integrated-black.svg"/></div><div class="small"><img src="heis-integrated-ivory.svg"/><img src="heis-integrated-ivory.svg"/></div></section></div><div class="footer">Both shown at equal height. Deep crimson / warm ivory / charcoal.</div></div></html>''')
