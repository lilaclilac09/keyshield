import sys
_p = 'C:/Users/justi/Desktop/keyshield'
_ns = f'{_p}/src'
_src = f'{_p}/src/python-legacy/src'

if _ns in sys.path:
    sys.path.remove(_ns)

if 'src' in sys.modules:
    del sys.modules['src']

sys.path.insert(0, _src)

import importlib.util
spec = importlib.util.find_spec('src')
print(f'found at: {spec.submodule_search_locations}')

from src import server
print('server OK')
