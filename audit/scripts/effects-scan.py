import re,os,sys
roots=['app','src']
pat=re.compile(r'useEffect\(|useLayoutEffect\(|addEventListener\(|addListener\(|setInterval\(|setTimeout\(|AppState\.|NetInfo|Notifications\.add\w*Listener|\.channel\(|\.subscribe\(|\.on\(|useAnimatedReaction|requestAnimationFrame|Keyboard\.add|Linking\.addEventListener|removeChannel|\.remove\(\)|clearTimeout|clearInterval|unsubscribe')
for r in roots:
  for d,_,fs in os.walk(r):
    for f in fs:
      if not f.endswith(('.ts','.tsx')) or '.test.' in f: continue
      p=os.path.join(d,f); L=open(p).read().split('\n')
      for i,l in enumerate(L):
        if pat.search(l) and not l.strip().startswith('//'):
          win='\n'.join(L[i:i+40])
          cl = 'CLEANUP?' if re.search(r'return\s*\(\)\s*=>|return\s+\w+;|\.remove\(|clearTimeout|clearInterval|unsubscribe|removeChannel',win) else 'no-cleanup'
          print(f'{p}:{i+1}: [{cl}] {l.strip()[:110]}')
