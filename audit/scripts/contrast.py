import json
t=json.load(open('packages/tokens/tokens.json'))['color']
def lum(h):
  h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
  f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
  return .2126*f(r)+.7152*f(g)+.0722*f(b)
def cr(a,b):
  x,y=lum(a),lum(b); x,y=max(x,y),min(x,y); return (x+.05)/(y+.05)
for mode in('light','dark'):
  c=t[mode]; print('==',mode)
  for fg in ['ink','ink2','ink3','red','green','amber','sky','peach','lilac']:
    for bg in ['bg','bg2','card']+([fg+'Bg'] if fg+'Bg' in c else []):
      r=cr(c[fg],c[bg]); print(f'{fg:6s} on {bg:8s} {r:5.2f} {"AA" if r>=4.5 else ("AA-large/UI" if r>=3 else "FAIL")}')
  print('line2 on bg (UI 3:1)',round(cr(c['line2'],c['bg']),2),'line',round(cr(c['line'],c['bg']),2))
print('== accents (fill vs on-colour text; accent vs white bg as UI)')
for k,v in t['accents'].items():
  print(k, 'onLight',round(cr(v['accent'],v['onAccentLight']),2),'onDark',round(cr(v['accent'],v['onAccentDark']),2),'accent vs white',round(cr(v['accent'],'#FFFFFF'),2),'vs darkbg',round(cr(v['accent'],t['dark']['bg']),2))
