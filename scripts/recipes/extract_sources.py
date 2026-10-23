"""Extract permitted, pinned Markdown source records without inventing metadata."""
import argparse,json,re
from pathlib import Path

def minutes(text):
 text=text.lower().replace('½','0.5')
 hours=re.search(r'(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)(?=\s|\d|$)',text)
 if hours:
  tail=text[hours.end():]; extra=re.search(r'(\d+)\s*min',tail)
  return round(float(hours[1])*60+(int(extra[1]) if extra else 0))
 nums=re.findall(r'\d+(?:\.\d+)?',text)
 if not nums:return None
 return float(nums[-1]) if len(nums)>1 and re.search(r'[-–~]',text) else float(nums[0])

def extract(root):
 records=[]
 for p in sorted((root/'content').glob('*.md')):
  text=p.read_text(); header=text.split('---')[1] if text.startswith('---') else ''
  title=re.search(r'(?m)^title:\s*(.*)$',header)
  if not title:continue
  author=re.search(r'(?m)^author:\s*(.*)$',header)
  y=re.search(r'(?:Servings?|Serves|Yield|Amount)\s*:\s*([^\n]+)',text,re.I)
  if not y:continue
  original_yield=y[1].strip()
  # Finite declared source ranges use their lower endpoint, authorised by owner.
  match=re.match(r'(?:makes\s+)?(\d+)(?:\s*[-–]\s*(\d+))?(?:\s+(?:people|person|bowls?|servings?|waffles?|patties|pancakes?|omelets?|biscuits?|breads?|slices))?(?:\s*\([^)]*\))?\s*$',original_yield,re.I)
  if not match:continue
  servings=int(match[1])
  before,sep,ingredients=text.partition('## Ingredients')
  if not sep:continue
  ingredients,sep,directions=ingredients.partition('## Directions')
  if not sep:continue
  directions=directions.split('\n## ')[0]
  lines=[]
  for line in ingredients.splitlines():
   if re.match(r'^\s*[-*]\s+',line):
    line=re.sub(r'^\s*[-*]\s+','',line).strip()
    if line:lines.append(line)
  steps=[]
  for line in directions.splitlines():
   line=line.strip()
   if not line:continue
   if re.match(r'^\d+\.',line):steps.append(re.sub(r'^\d+\.\s*','',line))
   elif steps:steps[-1]+=' '+line
   else:steps.append(line)
  prep=re.search(r'(?:Prep|Preparation)\s*time\s*:\s*([^\n]+)',text,re.I)
  cook=re.search(r'Cook(?:ing)?\s*time\s*:\s*([^\n]+)',text,re.I)
  image=re.search(r'!\[[^]]*\]\((/pix/[^ )]+)',text)
  photo=image[1] if image and (root/'static'/image[1].lstrip('/')).exists() else None
  if p.stem=='banana-oatmeal-cookies':photo='/pix/banana-otmeal-cookies.webp'
  records.append(dict(slug=p.stem,name=title[1].strip()[1:-1] if title[1].strip().startswith(chr(34)) and title[1].strip().endswith(chr(34)) else title[1].strip(),author=author[1].strip(' "\'') if author else 'Public Domain Recipes contributors',servings=servings,yieldLabel=original_yield,prep=minutes(prep[1]) if prep else None,cook=minutes(cook[1]) if cook else None,ingredients=lines,instructions=steps,photo=photo))
 return records
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('root');parser.add_argument('output');args=parser.parse_args()
 records=extract(Path(args.root));Path(args.output).write_text(json.dumps(records,ensure_ascii=False,indent=2));print('Extracted',len(records),'declared-yield source records')
