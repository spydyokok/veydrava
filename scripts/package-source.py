#!/usr/bin/env python3
"""Create the downloadable source, excluding secrets, caches, dependencies, and this archive."""
from pathlib import Path
import zipfile
root=Path(__file__).resolve().parent.parent
output=root/'public/veydrava-vercel-fixed.zip'
ignored={'node_modules','.git','.next','dist','data','broadcast','source-archives','work','outputs','.vercel'}
files=[]
for p in root.rglob('*'):
 if not p.is_file(): continue
 rel=p.relative_to(root)
 if any(part in ignored for part in rel.parts): continue
 if any(part.startswith('.') for part in rel.parts[:-1]): continue
 if rel.parts[:2] in [('contracts','out'),('contracts','cache'),('contracts','build')]:continue
 if p.suffix=='.zip' or p.name.endswith(('.tsbuildinfo','.sqlite','.sqlite-shm','.sqlite-wal','.pem')):continue
 if p.name.startswith('.env') and p.name!='.env.example':continue
 files.append(p)
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(files):
  rel=p.relative_to(root)
  data=p.read_bytes()
  # Keep package.json and app/ at the ZIP root so Vercel Drop detects Next.js.
  info=zipfile.ZipInfo(str(rel),date_time=(2026,9,12,0,0,0))
  info.compress_type=zipfile.ZIP_DEFLATED
  info.external_attr=(0o755 if p.suffix in ('.sh','.cjs') else 0o644)<<16
  z.writestr(info,data)
with zipfile.ZipFile(output) as z:
 assert z.testzip() is None
 for required in ['README.md','package-lock.json','.env.example','contracts/src/VeydravaVault.sol','sdk/index.mjs','services/relayer/server.mjs']:
  assert required in z.namelist()
print(f'{len(files)} source files; archive {output.stat().st_size:,} bytes')
