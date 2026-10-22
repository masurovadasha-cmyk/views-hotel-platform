#!/usr/bin/env python3
"""Render the owner-supplied PDF for explicitly labelled design review, not runtime UI."""
import argparse,hashlib,json,pathlib
import fitz
from PIL import Image
root=pathlib.Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('pdf',type=pathlib.Path);args=parser.parse_args()
registry=json.loads((root/'docs/design/canva-140-delivery.json').read_text())
assert hashlib.sha256(args.pdf.read_bytes()).hexdigest()==registry['sourceSha256'],'PDF source checksum differs'
doc=fitz.open(args.pdf);assert len(doc)==280
output=root/'public/design-140';output.mkdir(exist_ok=True)
assets=[]
for screen in registry['screens']:
 for theme,page_number in screen['pages'].items():
  page=doc[page_number-1];scale=min(1.8,1000/page.rect.width)
  pix=page.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False)
  path=output/(screen['id']+'-'+theme.lower()+'.webp')
  Image.frombytes('RGB',[pix.width,pix.height],pix.samples).save(path,'WEBP',quality=83,method=4)
  assets.append({'screenId':screen['id'],'theme':theme.lower(),'page':page_number,'file':path.name,'width':pix.width,'height':pix.height,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
assert len(assets)==280 and len({a['page'] for a in assets})==280
(output/'manifest.json').write_text(json.dumps({'kind':'design-reference-not-runtime','sourceSha256':registry['sourceSha256'],'assets':assets},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'screens':len(registry['screens']),'images':len(assets),'bytes':sum(a['bytes'] for a in assets)}))
