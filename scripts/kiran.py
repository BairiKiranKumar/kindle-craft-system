#!/usr/bin/env python3
"""Kiran Kindle Craft System: local, model-agnostic coloring-book production CLI.
Usage: python scripts/kiran.py --help
No network calls, publishing actions, or credentials are used.
"""
from __future__ import annotations
import argparse, hashlib, json, math, re, shutil, sys, tempfile
from pathlib import Path
from datetime import datetime, timezone
from PIL import Image, ImageStat, ImageOps
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.utils import ImageReader
try:
 from pypdf import PdfReader
except ImportError:
 PdfReader = None
ROOT=Path(__file__).resolve().parent.parent
PARENT=ROOT/'products'
POINTS=72.0
TRIM_W,TRIM_H=8.5,11.0
MIN_SCENES=24
DEFAULT_SCENES=50
SPINE_PER_PAGE=0.002252
SUPPORTED=('animals','birds','ocean','dinosaurs')

def write_json(path, data):
 path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')

def load(path): return json.loads(path.read_text(encoding='utf-8'))

def slugify(x): return re.sub('-+','-',re.sub('[^a-z0-9-]','-',x.lower())).strip('-')

def project_path(name):
 p=(PARENT/name).resolve()
 if p.parent!=PARENT.resolve(): raise ValueError('Invalid project slug')
 return p

def subjects(theme):
 pools={
  'animals':['elephant','bunny','bear','fox','lion','giraffe','panda','turtle','puppy','kitten','hedgehog','koala','monkey','squirrel','deer','lamb','piglet','frog','raccoon','mouse','otter','horse','zebra','hippo','sloth'],
  'birds':['robin','parrot','owl','penguin','sparrow','duckling','flamingo','swan','toucan','peacock','hummingbird','puffin','chick','bluebird','woodpecker','pelican','heron','kingfisher','finch','cockatoo','canary','seagull','kiwi bird','ostrich','crane'],
  'ocean':['dolphin','whale','seahorse','octopus','sea turtle','starfish','crab','clownfish','jellyfish','seal','penguin','manta ray','shark','lobster','pufferfish','narwhal','sea lion','squid','coral fish','eel','otter','seashell','anglerfish','hermit crab','stingray'],
  'dinosaurs':['friendly t-rex','triceratops','stegosaurus','brachiosaurus','ankylosaurus','parasaurolophus','spinosaurus','diplodocus','pachycephalosaurus','iguanodon','allosaurus','ceratosaurus','carnotaurus','velociraptor','apatosaurus','compsognathus','plateosaurus','kentrosaurus','dilophosaurus','styracosaurus','maiasaura','protoceratops','gallimimus','edmontosaurus','coelophysis']
 }
 return pools.get(theme, [theme.strip() or 'friendly character'])

SETTINGS=[('watering flowers','sunny garden'),('sharing a picnic','grassy meadow'),('flying a kite','clear park'),('painting a picture','art studio'),('reading a book','cozy library'),('playing in puddles','rainy path'),('baking cupcakes','home kitchen'),('celebrating a birthday','party table'),('kicking a ball','sports field'),('building a sandcastle','sandy beach'),('watching stars','night sky'),('enjoying an ice cream','summer fair'),('making bubbles','riverbank'),('exploring a forest','woodland path'),('holding balloons','festival'),('watering a tree','orchard'),('riding a scooter','neighborhood path'),('planting vegetables','vegetable patch'),('playing with toy blocks','play room'),('packing a school bag','classroom'),('resting under clouds','hilltop'),('finding mushrooms','woodland glade'),('camping with a tent','campground'),('discovering a rainbow','rainy meadow'),('playing music','music corner')]


THEME_SETTINGS={
 'ocean':[
  ('swimming around coral','bright reef'),('playing hide-and-seek','undersea plants'),('exploring a shipwreck','gentle ocean scene'),('finding shiny shells','sandy sea floor'),('floating among bubbles','clear blue underwater setting'),('visiting a friendly turtle','coral garden'),('traveling past sea stars','shallow bay'),('watching seaweed sway','sea grass meadow'),('peeking from a cave','underwater rocks'),('chasing playful bubbles','sunlit shallow water'),('meeting a tiny fish','coral doorway'),('finding a pearl','ocean seabed'),('resting near coral','lagoon'),('playing with a starfish','gentle shallows'),('swimming beneath sunbeams','open sea'),('discovering a secret tunnel','underwater rock arch'),('following a sea current','underwater valley'),('greeting a friendly dolphin','warm lagoon'),('exploring a kelp forest','undersea forest'),('passing a lighthouse','coastal water'),('watching a sea horse','coral habitat'),('sharing a game of bubbles','reef'),('splashing close to shore','beach shoreline'),('investigating a sea cave','ocean inlet'),('floating in a gentle current','calm sea')],
 'birds':[
  ('sitting on a leafy branch','sunny garden'),('finding a feather','meadow'),('building a little nest','tree canopy'),('watching a sunrise','treetop'),('splashing at a birdbath','courtyard'),('eating a berry','orchard'),('meeting two butterflies','flower garden'),('singing happily','morning forest'),('protecting little eggs','cozy nest'),('soaring over hills','sky'),('perching by a pond','reed bed'),('watching falling leaves','autumn tree'),('picking a twig','woodland path'),('fluffing soft feathers','rainy-day nest'),('greeting a friend','garden fence'),('peeking into a birdhouse','backyard'),('looking at the moon','nighttime tree'),('finding a dandelion','field'),('walking through flowers','meadow path'),('resting on a rock','mountainside'),('visiting sunflowers','flower patch'),('sharing seeds','backyard'),('playing near a stream','woods'),('flying past clouds','blue sky'),('enjoying a gentle breeze','tall grassy field')],
 'dinosaurs':[
  ('discovering a big fern','prehistoric forest'),('meeting a baby dinosaur','fern valley'),('watching a volcano from far away','dinosaur valley'),('playing near a pond','ancient marsh'),('walking past giant leaves','jungle path'),('finding a dinosaur footprint','muddy trail'),('resting under a tall tree','ancient woodland'),('splashing in a stream','tropical river'),('sharing leaves','green valley'),('walking under clouds','wide meadow'),('exploring rocky hills','prehistoric canyon'),('discovering a big flower','ancient garden'),('staying cozy in rain','fern forest'),('watching the sunrise','rocky ridge'),('meeting a friendly sibling','dinosaur grove'),('exploring a new path','old-growth forest'),('observing insects','fern field'),('looking at a waterfall','prehistoric landscape'),('finding colorful stones','sandy river'),('crossing a tiny stream','forest'),('resting in tall grasses','prehistoric meadow'),('watching birds fly overhead','open plain'),('listening to a waterfall','rocky landscape'),('finding a comfy resting spot','leafy grove'),('seeing the moon rise','ancient valley')]
}

def scene_prompt(subject,action,setting):
 return (f'Create one ORIGINAL children’s printable coloring-book illustration: a cheerful {subject} {action} in a {setting}. '
  'Portrait 8.5x11 composition, thick smooth black closed outlines, white background, generous large open areas, friendly expressions, simple believable anatomy, ages 3-5, uncluttered, no gradients, grayscale, shadows, colored fills, texture, letters, words, logos, watermarks, borders or copyrighted characters. '
  'Keep important shapes well inside the canvas edges. Draw ONE complete coherent scene, not a collage. Output an image suitable for high-resolution clean line art.')

def create(args):
 slug=slugify(args.slug or args.theme)
 p=project_path(slug)
 if p.exists(): raise SystemExit(f'Project already exists: {p}')
 for d in ['assets/art','assets/cover','research','prompts','reviews','exports']:(p/d).mkdir(parents=True,exist_ok=True)
 book_title=args.title or (args.theme.title()+' Little Adventures')
 cfg={'project_slug':slug,'theme':args.theme,'title':book_title,
  'subtitle':args.subtitle or 'A Big and Easy Coloring Book for Kids Ages 3-5',
  'author_display_name':'Kiran Craft Kids','brand_working_name':'Kiran Craft Kids',
  'target_audience':'Ages 3-5','language':'English','primary_marketplace':'Amazon.com',
  'trim_width_in':8.5,'trim_height_in':11.0,'interior':'black_and_white_white_paper_no_bleed',
  'illustration_count':args.count,'price_usd':9.99,'isbn_choice':'free_kdp_if_eligible',
  'copyright_year':2026,'rights_verified':False,'brand_name_cleared':False,
  'description_reviewed':False,'kdp_ai_images_disclose':True,
  'age_range_checked':False,'source_notes':'Original illustration generation; verify rights for each image'}
 write_json(p/'project.json',cfg)
 pool=subjects(args.theme.lower().strip())
 scenes=[]
 settings=THEME_SETTINGS.get(args.theme.lower().strip(),SETTINGS)
 for i in range(args.count):
  subj=pool[i%len(pool)]
  action,setting=settings[i%len(settings)]
  if i>=len(settings): action,setting=settings[(i+7)%len(settings)];action='happily '+action
  scenes.append({'id':f'{i+1:03d}','name':f'{subj.title()} {action}', 'subject':subj,'setting':setting,
    'file':f'{i+1:03d}.png','prompt':scene_prompt(subj,action,setting),
    'approved':False,'rights_checked':False,'notes':''})
 write_json(p/'scenes.json',scenes)
 write_json(p/'metadata.json',{'title':book_title,'subtitle':cfg['subtitle'],'author':cfg['author_display_name'],
  'description':'TO BE HUMAN-WRITTEN AND VERIFIED against finished book before publication.',
  'keywords':['large simple pictures','preschool creative activity','easy beginner coloring','cute friendly scenes','big bold line art','ages three to five art','coloring activity for kids'],
  'categories':['TO SELECT FROM LIVE KDP CATEGORY PICKER'],
  'reading_age':'3-5 (check the KDP options before entering)',
  'rights':'Worldwide ONLY IF rights verified','ai_content':'AI-generated images: YES if any image is generated',
  'claims_checked':False})
 (p/'HANDOFF.md').write_text(f'# Agent handoff: {slug}\n\nCurrent stage: RESEARCH (not yet production-approved)\n\nNext step: research competitors using current Amazon listings, refine 50 individual scenes, record evidence in research/competitive_scan.csv.\nDo not publish. Do not assert sales or bestseller data without dated evidence.\n\nResume: read root AGENTS.md, project.json, scenes.json, metadata.json, reviews/review.md, HANDOFF.md.\n',encoding='utf-8')
 (p/'reviews/review.md').write_text('# Human review log\n\n- [ ] Theme and competitive research evidence reviewed\n- [ ] Title, brand, trademarks checked\n- [ ] Every illustration is original, unique, child-appropriate and technically clean\n- [ ] Publishing rights of each image verified\n- [ ] Physical printed proof ordered and checked\n- [ ] Amazon metadata and category selections checked\n- [ ] AI-generated images disclosure answered accurately\n- [ ] Final go/no-go publication approval by account owner\n',encoding='utf-8')
 (p/'research/competitive_scan.csv').write_text('checked_date_utc,marketplace,amazon_url,title,author,format,list_price_usd,page_count,review_count,bsr_if_visible,search_phrase,differentiation,notes\n',encoding='utf-8')
 (p/'assets/art/README.md').write_text('Save numbered 300-effective-DPI ORIGINAL artworks here: 001.png, 002.png ... For the 8.5x11 no-bleed template, the illustrated area is 7.2x9.3 inches; minimum image dimensions exactly 2160x2790 px at 300 DPI. Review each scene then manually mark approved and rights_checked in scenes.json. Never upscale low-quality artwork just to pass validation; simple image resizing does not create genuine print-quality line art.\n',encoding='utf-8')
 print(f'Created: {p}\nIllustration prompts: {p/"scenes.json"}\nFinish each numbered PNG, then use: python scripts/kiran.py validate --project {slug}')

def price_estimate(price,pages):
 if pages<24 or pages>828: raise ValueError('Outside modeled KDP page count')
 # Amazon.com black-ink WHITE PAPER, LARGE trim; explicitly verify live KDP pricing prior to publication.
 cost=2.84 if pages<=110 else 1.00+pages*0.017
 rate=0.60 if price>=9.99 else 0.50
 return {'price':round(price,2),'pages':pages,'kdp_rate':rate,'print_cost_usd':round(cost,2),
  'royalty_usd':round(rate*price-round(cost,2),2),'scope':'Amazon.com KDP black ink white paper, large trim only; estimate before taxes/ads'}

def artwork_metrics(path,draw_w_in=7.2,draw_h_in=9.3):
 try:
  with Image.open(path) as im:
   w,h=im.size
   exif=im.getexif()
   stat=ImageStat.Stat(im.convert('RGB').resize((120,160)))
   mean=stat.mean
   # conservative global-color test; many black-white pages are fine with equal channels
   delta=max(mean)-min(mean)
   return {'pixels':[w,h],'effective_dpi':[round(w/draw_w_in),round(h/draw_h_in)],'mean_color_channel_spread':round(delta,2)}
 except Exception as e: return {'error':str(e)}

def check_project(p):
 cfg=load(p/'project.json');scenes=load(p/'scenes.json');metadata=load(p/'metadata.json')
 errors=[];warnings=[];checks=[]
 if cfg['trim_width_in']!=8.5 or cfg['trim_height_in']!=11:errors.append('This version only builds 8.5x11 interiors')
 if cfg['interior']!='black_and_white_white_paper_no_bleed':errors.append('Only black-white no-bleed interiors supported')
 if len(scenes)!=cfg['illustration_count']:errors.append('Scene count mismatch')
 if len(scenes)<MIN_SCENES:errors.append('Fewer than 24 illustrations')
 total_pages=2+len(scenes)*2
 if not 24<=total_pages<=110:warnings.append('Printing cost formula changes above 110 pp; review manually')
 fingerprints={};names=set()
 for sc in scenes:
  fn=sc['file'];f=p/'assets/art'/fn
  if fn in names:errors.append(f'Duplicate filename {fn}')
  names.add(fn)
  if not f.exists():errors.append(f'Missing art: {fn}');continue
  info=artwork_metrics(f)
  if 'error' in info:errors.append(f'Cannot read {fn}: {info["error"]}');continue
  w,h=info['pixels'];dpi=min(info['effective_dpi'])
  if w<h:pass
  else:errors.append(f'Not portrait: {fn}')
  if dpi<300:errors.append(f'{fn} below 300 effective DPI: {info["effective_dpi"]}')
  digest=hashlib.sha256(f.read_bytes()).hexdigest()
  if digest in fingerprints:errors.append(f'Duplicate binary art: {fn} same as {fingerprints[digest]}')
  fingerprints[digest]=fn
  if info['mean_color_channel_spread']>6:warnings.append(f'{fn} appears colored: review line-art black ink suitability')
  if not sc.get('approved') or not sc.get('rights_checked'):errors.append(f'Not human-approved/rights-checked: {fn}')
  checks.append({'file':fn,**info})
 cover_art=p/'assets/cover/front_art.png'
 if cover_art.exists():
  info=artwork_metrics(cover_art,draw_w_in=4.2,draw_h_in=4.1)
  if 'error' in info:errors.append('Cover art unreadable: '+info['error'])
  elif min(info['effective_dpi'])<300:errors.append(f'Cover art below 300 effective DPI: {info["effective_dpi"]}')
 for key in ['rights_verified','brand_name_cleared','description_reviewed','age_range_checked']:
  if not cfg.get(key):errors.append(f'Project approval missing: {key}')
 if not metadata.get('claims_checked'):errors.append('metadata claims_checked is false')
 if metadata.get('title')!=cfg.get('title') or metadata.get('author')!=cfg.get('author_display_name'):errors.append('Metadata title/author mismatch')
 if not isinstance(metadata.get('keywords'),list) or len(metadata['keywords'])>7:errors.append('Maximum 7 KDP keywords')
 if not metadata.get('description','').strip() or 'TO BE' in metadata['description']:errors.append('Replace placeholder description')
 if any('TO SELECT' in x for x in metadata.get('categories',[])):errors.append('Choose actual categories in KDP picker')
 if not cfg.get('kdp_ai_images_disclose'):warnings.append('AI image disclosure flag false: confirm truthfulness during KDP upload')
 out={'checked_utc':datetime.now(timezone.utc).isoformat(),'project':cfg['project_slug'],
    'status':'PASS_LOCAL_PREFLIGHT' if not errors else 'BLOCKED','errors':errors,'warnings':warnings,
    'assets':checks,'page_count_expected':len(scenes)*2+2,'price_estimate':price_estimate(float(cfg['price_usd']),2+len(scenes)*2)}
 write_json(p/'reviews/automated_qa.json',out)
 return out

def try_font(c,prefer='Helvetica-Bold'):
 # bundled Postscript fonts are supported, so no proprietary font files are needed.
 c.setFont(prefer,12)

def split_text(text,maxlen=39):
 words=text.split(); lines=[];cur=''
 for w in words:
  if len(cur+' '+w)>maxlen and cur: lines.append(cur);cur=w
  else:cur=(cur+' '+w).strip()
 if cur:lines.append(cur)
 return lines

def make_interior(p,cfg,scenes):
 out=p/'exports/interior_8.5x11_no_bleed.pdf';out.parent.mkdir(exist_ok=True,parents=True)
 W,H=8.5*72,11*72
 c=canvas.Canvas(str(out),pagesize=(W,H),pageCompression=1)
 c.setTitle(cfg['title']);c.setAuthor(cfg['author_display_name'])
 c.setFillColor(HexColor('#222222'));c.setFont('Helvetica-Bold',28)
 title_lines=split_text(cfg['title'],24)
 for i,line in enumerate(title_lines): c.drawCentredString(W/2,520-36*i,line)
 c.setFont('Helvetica',14)
 for i,line in enumerate(split_text(cfg['subtitle'],42)):c.drawCentredString(W/2,399-i*24,line)
 c.setFont('Helvetica',12);c.drawCentredString(W/2,238,cfg['author_display_name'])
 c.drawCentredString(W/2,169,'A big, bold coloring adventure!');c.showPage()
 c.setFont('Helvetica-Bold',20);c.drawString(60,670,'Hello, little artist!')
 c.setFont('Helvetica',12)
 for i,line in enumerate(['Enjoy the pictures and use any colors you like.','Colored pencils and crayons work well.','Place a spare sheet underneath when using markers.']):c.drawString(62,615-i*32,line)
 c.setFont('Helvetica-Bold',17);c.drawString(62,405,'This book belongs to:')
 c.setStrokeColor(HexColor('#222222'));c.line(62,375,490,375)
 c.setFont('Helvetica',9);c.drawString(62,111,'Copyright (c) '+str(cfg['copyright_year'])+' '+cfg['author_display_name'])
 c.drawString(62,91,'All rights reserved.');c.showPage()
 for i,scene in enumerate(scenes):
  filename=p/'assets/art'/scene['file']
  # Pre-compress as 300+ effective DPI grayscale JPEG to keep multi-page PDF builds fast.
  # Retains anti-aliased black outlines, avoids large uncompressed RGBA streams.
  from io import BytesIO
  with Image.open(filename) as src:
   im=ImageOps.exif_transpose(src).convert('L')
   ow,oh=im.size
   im_bytes=BytesIO(); im.save(im_bytes,format='JPEG',quality=96,subsampling=0,optimize=False)
  im_bytes.seek(0);image=ImageReader(im_bytes)
  maxw,maxh=7.2*72,9.3*72
  width=min(maxw,maxh*ow/oh);height=width*oh/ow
  if height>maxh:height=maxh;width=height*ow/oh
  x=(W-width)/2;y=(H-height)/2
  c.drawImage(image,x,y,width=width,height=height,mask='auto')
  c.showPage()
  # Single-sided interior: blank reverse page follows each illustration to prevent bleed-through
  c.showPage()
 c.save();return out

def make_cover(p,cfg,scenes,pages):
 W,H=8.5*72,11*72; bleed=9; spine=pages*SPINE_PER_PAGE*72
 total_w=2*W+spine+2*bleed;total_h=H+2*bleed
 out=p/'exports/cover_full_wrap.pdf';cc=canvas.Canvas(str(out),pagesize=(total_w,total_h),pageCompression=1)
 cream=HexColor('#FFF5E3');ink=HexColor('#27334A');peach=HexColor('#F6A57E');mint=HexColor('#A5D6BE')
 cc.setFillColor(cream);cc.rect(0,0,total_w,total_h,stroke=0,fill=1)
 # Back cover occupies left book panel in the full spread.
 cc.saveState();cc.translate(bleed,bleed)
 cc.setFillColor(ink);cc.setFont('Helvetica-Bold',26);cc.drawString(51,665,'Come color and explore!')
 cc.setFont('Helvetica',14)
 bcopy=[f'{len(scenes)} original coloring scenes filled with', 'friendly characters and playful moments.', 'Made for little artists and big imaginations.','Great with crayons or colored pencils.']
 for i,line in enumerate(bcopy):cc.drawString(52,613-i*29,line)
 cc.setFillColor(mint);cc.roundRect(48,340,515,103,22,stroke=0,fill=1)
 cc.setFillColor(ink);cc.setFont('Helvetica-Bold',22);cc.drawString(72,391,'BIG SHAPES. HAPPY IDEAS.')
 cc.setFont('Helvetica',13);cc.drawString(73,360,'Ages 3-5  |  Just pick a color and start!')
 # Reserved white barcode area, lower-right on the physical back cover.
 cc.setFillColor(white);cc.rect(W-2.65*72,0.60*72,2.18*72,1.38*72,stroke=0,fill=1)
 cc.restoreState()
 # Front cover
 cc.saveState();cc.translate(bleed+W+spine,bleed)
 cc.setFillColor(peach);cc.circle(W/2,365,213,stroke=0,fill=1)
 cc.setFillColor(mint);cc.roundRect(44,88,523,112,28,stroke=0,fill=1)
 cc.setFillColor(ink)
 title_lines=split_text(cfg['title'].upper(),19)
 if len(title_lines)>3: raise ValueError('Title too long for built-in cover: shorten it or use manual cover template')
 cc.setFont('Helvetica-Bold',38 if max(len(x) for x in title_lines)<19 else 33)
 for j,line in enumerate(title_lines):cc.drawCentredString(W/2,675-j*47,line)
 cc.setFont('Helvetica-Bold',18)
 for j,line in enumerate(split_text(cfg['subtitle'],48)[:3]):cc.drawCentredString(W/2,160-j*27,line)
 cc.setFont('Helvetica-Bold',14);cc.drawCentredString(W/2,63,cfg['author_display_name'])
 # Draw art from the first approved scene, preserving original black line art.
 art=(p/'assets/cover/front_art.png') if (p/'assets/cover/front_art.png').exists() else (p/'assets/art'/scenes[0]['file'])
 with Image.open(art) as im: ratio=im.width/im.height
 hh=290;ww=min(300,hh*ratio)
 cc.setFillColor(white);cc.roundRect(W/2-ww/2-13,257,ww+26,hh+24,21,stroke=0,fill=1)
 cc.drawImage(ImageReader(str(art)),W/2-ww/2,269,ww,hh,mask='auto')
 cc.restoreState();cc.save()
 (p/'exports/cover_dimensions.txt').write_text(f'Interior: {W:.2f} x {H:.2f} pt (8.5 x 11 inches), NO BLEED\nCover: {total_w:.3f} x {total_h:.3f} pt; {total_w/72:.5f} x {total_h/72:.5f} inches\nSpine width: {spine/72:.5f} inches; page count: {pages}; white paper\nNo spine text below 79 pages.\nIMPORTANT: Check cover against an OFFICIAL KDP cover template and Print Previewer before upload.\n',encoding='utf-8')
 return out

def make_pack(p,cfg,scenes):
 meta=load(p/'metadata.json');n=len(scenes);total_pages=n*2+2;price=price_estimate(float(cfg['price_usd']),total_pages)
 text=(f'KDP MANUAL ENTRY — {cfg["title"]}\n\n'
 f'Title: {cfg["title"]}\nSubtitle: {cfg["subtitle"]}\nAuthor: {cfg["author_display_name"]}\n'
 f'Language: {cfg["language"]}\nFormat: Paperback\nPrint: black ink, white paper\nTrim: 8.5 x 11\nBleed: NO BLEED\nFinish: Matte (suggested)\nPages: {total_pages}\n'
 f'ISBN: Free KDP ISBN if eligible; do not invent an ISBN\nLow content: No, normally (verify for actual content)\n'
 f'Primary marketplace: {cfg["primary_marketplace"]}\nSuggested US list price: ${float(cfg["price_usd"]):.2f}\n'
 f'Royalty estimate: ${price["royalty_usd"]:.2f} per Amazon.com sale before deductions\n'
 f'Rights: Worldwide ONLY if you verified your rights\nAI-generated image disclosure: YES if any illustrations generated by AI\n'
 f'Expanded Distribution: Do not select for coloring books (ineligible)\n\n'
 f'DESCRIPTION\n{meta["description"]}\n\nKEYWORDS\n'+'\n'.join(f'{i+1}. {k}' for i,k in enumerate(meta['keywords']))+'\n\n'
 'CATEGORIES\n'+'\n'.join(meta['categories'])+'\n\n'
 'STOP BEFORE PUBLISHING: verify title/trademark, metadata, printed proof, KDP previewer, and the live category list.\n')
 (p/'exports/kdp_manual_entry.txt').write_text(text,encoding='utf-8')
 (p/'exports/product_manifest.json').write_text(json.dumps({'title':cfg['title'],'brand':cfg['brand_working_name'],
 'illustrations':n,'interior_file':'interior_8.5x11_no_bleed.pdf','cover_file':'cover_full_wrap.pdf',
 'listing_file':'kdp_manual_entry.txt','amazon_product_url':None,
 'publishing_status':'READY_FOR_HUMAN_REVIEW_NOT_UPLOADED','estimated_royalty':price},indent=2)+'\n')
 (p/'exports/promo_copy.txt').write_text(f'INTRODUCING {cfg["title"].upper()}\nDiscover {n} cheerful coloring illustrations. Big outlines, playful scenes, made for ages 3-5.\n\nInstagram reel script: Show 3 original interior spreads, zoom on thick black outlines, show the physical proof when received, then reveal cover. CTA: Available on Amazon after publication.\n\nIMPORTANT: Do not say available/approved until listing is live. Do not use AI-made fake reviews or misleading educational/clinical claims.\n',encoding='utf-8')

def cmd_validate(args):
 p=project_path(args.project);r=check_project(p)
 print('Status:',r['status'],'\nPages:',r['page_count_expected'],'\nErrors:',len(r['errors']),'Warnings:',len(r['warnings']))
 for e in r['errors'][:18]:print('ERROR',e)
 if len(r['errors'])>18:print('... plus',len(r['errors'])-18,'more; see reviews/automated_qa.json')
 for e in r['warnings'][:10]:print('WARN ',e)
 if r['errors']:sys.exit(2)

def cmd_build(args):
 p=project_path(args.project);r=check_project(p)
 if r['errors']:raise SystemExit('BLOCKED: Fix validation errors; see '+str(p/'reviews/automated_qa.json'))
 cfg=load(p/'project.json');scenes=load(p/'scenes.json')
 total_pages=len(scenes)*2+2
 a=make_interior(p,cfg,scenes);b=make_cover(p,cfg,scenes,total_pages);make_pack(p,cfg,scenes)
 if PdfReader:
  pdf=PdfReader(str(a));cover=PdfReader(str(b))
  assert len(pdf.pages)==total_pages
  assert len(cover.pages)==1
 print('LOCAL FILES PRODUCED (NOT automatically published):\n',a,'\n',b,'\n',p/'exports/kdp_manual_entry.txt')
 print('NEXT: KDP official cover template check, KDP Print Previewer, physical proof, publication approval.')


def cmd_contact(args):
 p=project_path(args.project);scenes=load(p/'scenes.json')
 from PIL import ImageDraw,ImageFont
 tile_w,tile_h=230,314;cols=5;rows=math.ceil(len(scenes)/cols)
 board=Image.new('RGB',(cols*tile_w,rows*tile_h),(242,244,245));draw=ImageDraw.Draw(board)
 for i,sc in enumerate(scenes):
  f=p/'assets/art'/sc['file'];x=(i%cols)*tile_w;y=(i//cols)*tile_h
  draw.rectangle((x+5,y+5,x+tile_w-5,y+tile_h-5),fill='white',outline=(208,211,216),width=2)
  if f.exists():
   with Image.open(f) as original:
    im=ImageOps.exif_transpose(original).convert('RGB');im.thumbnail((tile_w-20,tile_h-56))
   board.paste(im,(x+(tile_w-im.width)//2,y+11))
  label=f'{sc["id"]} '+('APPROVED' if sc.get('approved') and sc.get('rights_checked') else 'PENDING')
  draw.text((x+12,y+tile_h-34),label,fill=(17,29,44))
 out=p/'reviews/contact_sheet.jpg';out.parent.mkdir(exist_ok=True,parents=True);board.save(out,quality=90)
 print('Contact sheet:',out)

def cmd_price(args):
 for price in ([7.99,8.99,9.99,10.99,11.99,12.99] if args.price is None else [args.price]):
  print(json.dumps(price_estimate(price,args.pages)))

def cmd_status(args):
 p=project_path(args.project);cfg=load(p/'project.json');scenes=load(p/'scenes.json')
 n_have=sum((p/'assets/art'/s['file']).exists() for s in scenes)
 n_approved=sum(bool(s.get('approved') and s.get('rights_checked')) for s in scenes)
 print(f'{cfg["title"]}\nTheme: {cfg["theme"]}\nArtwork files: {n_have}/{len(scenes)}\nApproved + rights-checked: {n_approved}/{len(scenes)}\nPrice: ${cfg["price_usd"]}\nNext: read HANDOFF.md and review gates.')

def main():
 ap=argparse.ArgumentParser(description='Kiran Kindle Craft System — ethical local print-production pipeline')
 sub=ap.add_subparsers(dest='command',required=True)
 a=sub.add_parser('new',help='Create new themed project from prompt pack')
 a.add_argument('--theme',required=True);a.add_argument('--slug');a.add_argument('--title');a.add_argument('--subtitle');a.add_argument('--count',type=int,default=50);a.set_defaults(func=create)
 for cmd,fn in [('validate',cmd_validate),('build',cmd_build),('status',cmd_status)]:
  a=sub.add_parser(cmd);a.add_argument('--project',required=True);a.set_defaults(func=fn)
 a=sub.add_parser('contact');a.add_argument('--project',required=True);a.set_defaults(func=cmd_contact)
 a=sub.add_parser('pricing');a.add_argument('--pages',type=int,default=102);a.add_argument('--price',type=float);a.set_defaults(func=cmd_price)
 args=ap.parse_args();args.func(args)
if __name__=='__main__':main()
