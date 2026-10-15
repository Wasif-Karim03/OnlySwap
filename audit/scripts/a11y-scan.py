import re,os,sys
tags=['Tappable','Pressable','TouchableOpacity','TouchableWithoutFeedback','IconButton','Button']
res=[];tot=0
for root in ['apps/mobile/src','apps/mobile/app']:
  for d,_,fs in os.walk(root):
    for f in fs:
      if not f.endswith('.tsx') or '.test.' in f or '/dev/' in d: continue
      p=os.path.join(d,f); s=open(p).read()
      for m in re.finditer(r'<(%s)\b'%'|'.join(tags),s):
        # capture until matching '>' at depth 0 of braces
        i=m.end(); depth=0
        while i<len(s):
          c=s[i]
          if c=='{':depth+=1
          elif c=='}':depth-=1
          elif c=='>' and depth==0 and s[i-1]!='=': break
          i+=1
        t=s[m.start():i]; tot+=1
        line=s[:m.start()].count('\n')+1
        name=m.group(1)
        spread='{...' in t
        lab=('accessibilityLabel' in t) or ('label=' in t and name in('Button',)) or ('label=' in t and name=='IconButton')
        role='accessibilityRole' in t or name in ('Button','IconButton')
        if not (lab and role) and not spread:
          res.append(f'{p}:{line}: <{name}> label={lab} role={role}')
print('total tags',tot,'flagged',len(res)); print('\n'.join(res))
