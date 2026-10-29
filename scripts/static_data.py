"""Write a generated dataset as hashed JSON plus a thin TypeScript loader module.

The JSON goes to public/data/static/<name>.<hash>.json (served as a static file, not
bundled); src/<name>.ts awaits it through src/static-data.ts. Older hashed copies of
the same dataset are removed so only the referenced file remains.
"""
import hashlib, json
from pathlib import Path

def write_static_data(root: Path, name: str, value, *, comment: str, type_imports: str = '', export: str, type_: str = 'unknown', ensure_ascii: bool = False) -> Path:
    text = json.dumps(value, ensure_ascii=ensure_ascii, separators=(',', ':'))
    return write_static_json(root, name, text, comment=comment, type_imports=type_imports, export=export, type_=type_)

def write_static_json(root: Path, name: str, text: str, *, comment: str, type_imports: str = '', export: str, type_: str = 'unknown') -> Path:
    digest = hashlib.sha256(text.encode()).hexdigest()[:8]
    out = root / 'public/data/static'
    out.mkdir(parents=True, exist_ok=True)
    file = f'{name}.{digest}.json'
    for old in out.glob(f'{name}.*.json'):
        if old.name != file:
            old.unlink()
    (out / file).write_text(text)
    stub = (f'// {comment}\n'
            f'// Data: public/data/static/{file}, loaded at startup via src/static-data.ts.\n'
            "import {loadStaticData} from './static-data.ts';\n"
            f'{type_imports}'
            f"export const {export} = await loadStaticData<{type_}>('{file}');\n")
    (root / 'src' / f'{name}.ts').write_text(stub)
    return out / file
