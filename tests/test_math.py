import importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('kiran',Path(__file__).parents[1]/'scripts/kiran.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
assert m.price_estimate(9.99,52)['royalty_usd']==3.15
assert m.price_estimate(8.99,52)['royalty_usd']==1.66
assert m.price_estimate(9.99,52)['print_cost_usd']==2.84
assert m.price_estimate(12.99,152)['print_cost_usd']==3.58
assert len(m.subjects('animals'))==25
print('Math and setup smoke tests PASS')
