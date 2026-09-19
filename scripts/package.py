"""Package only extension assets; never include tests, private data or dependencies."""
from pathlib import Path
import json
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
source = root / 'extension'
manifest = json.loads((source / 'manifest.json').read_text())
files = ['manifest.json']
for script in manifest['content_scripts']:
    files.extend(script.get('js', []))
    files.extend(script.get('css', []))
output = root / 'dist'
output.mkdir(exist_ok=True)
archive = output / f"applovin-cohort-enhancer-{manifest['version']}.zip"
with ZipFile(archive, 'w', ZIP_DEFLATED) as package:
    for name in dict.fromkeys(files):
        path = source / name
        assert path.resolve().is_relative_to(source.resolve())
        package.write(path, name)
with ZipFile(archive) as package:
    assert package.testzip() is None
    assert set(package.namelist()) == set(files)
print(archive)
