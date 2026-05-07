import sys
_ns = 'C:/Users/justi/Desktop/keyshield/src'
if _ns in sys.path:
    sys.path.remove(_ns)
print(f'removed {_ns}')
import importlib.util
spec = importlib.util.find_spec('src')
print(spec.submodule_search_locations)
