import os,re
root='app'; out=[]
for d,_,fs in sorted(os.walk(root)):
  for f in sorted(fs):
    if not f.endswith('.tsx') or f.startswith('_'): continue
    p=os.path.join(d,f); s=open(p).read()
    imps=re.findall(r"from '(@/features/[^']+|\.\./[^']+|@/[^']+)'",s)
    files=[]
    for i in imps:
      if i.startswith('@/'):
        b='src/'+i[2:]
        for e in ('.tsx','.ts','/index.tsx','/index.ts'):
          if os.path.exists(b+e): files.append(b+e)
    body=s+''.join(open(x).read() for x in files if x.endswith('.tsx'))
    # include sibling same-feature files for components imported relatively
    for x in list(files):
      dd=os.path.dirname(x); t=open(x).read()
      for r in re.findall(r"from '(\./[^']+)'",t):
        for e in ('.tsx','.ts'):
          q=os.path.join(dd,r+e)
          if os.path.exists(q) and q.endswith('.tsx'): body+=open(q).read()
    flags=[('load',r'Skeleton|isPending|isLoading|ActivityIndicator|phase ===|loading'),('empty',r'EmptyState|empty'),('error',r'ErrorState|isError|\.error|catch'),('offline',r'useNetInfo|isOffline|OFFLINE|offline|ERR_OFFLINE'),('perm',r'permission|Permission|denied|openSettings')]
    r=[k+('Y' if re.search(p,body) else '-') for k,p in flags]
    out.append(f"{p[4:]:40s} {' '.join(r)}  <- {','.join(os.path.basename(x) for x in files[:2])}")
print('\n'.join(out))
