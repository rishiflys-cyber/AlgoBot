
import pandas as pd
from backtest_engine import BacktestEngine
from strategy import ExampleStrategy

data = pd.read_csv("data.csv")

engine = BacktestEngine(
    data=data,
    strategy=ExampleStrategy(),
    initial_capital=100000
)

results = engine.run()

print(results)
