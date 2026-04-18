
import pandas as pd
import numpy as np

class BacktestEngine:
    def __init__(self, data, strategy, initial_capital=100000):
        self.data = data.copy()
        self.strategy = strategy
        self.initial_capital = initial_capital

        self.cash = initial_capital
        self.position = 0
        self.entry_price = 0

        self.equity_curve = []
        self.trades = []

    def run(self):
        self.data = self.strategy.generate_signals(self.data)

        for i in range(len(self.data)):
            row = self.data.iloc[i]

            signal = row.get("signal", 0)
            price = row["close"]

            if signal == 1 and self.position == 0:
                self.position = self.cash / price
                self.entry_price = price
                self.cash = 0

                self.trades.append({
                    "type": "BUY",
                    "price": price,
                    "index": i
                })

            elif signal == -1 and self.position > 0:
                self.cash = self.position * price
                pnl = (price - self.entry_price) * self.position

                self.trades.append({
                    "type": "SELL",
                    "price": price,
                    "pnl": pnl,
                    "index": i
                })

                self.position = 0
                self.entry_price = 0

            equity = self.cash + (self.position * price)
            self.equity_curve.append(equity)

        return self._results()

    def _results(self):
        equity_series = pd.Series(self.equity_curve)
        returns = equity_series.pct_change().fillna(0)

        total_return = (equity_series.iloc[-1] / self.initial_capital) - 1
        sharpe = np.sqrt(252) * returns.mean() / (returns.std() + 1e-9)

        drawdown = (equity_series.cummax() - equity_series) / equity_series.cummax()
        max_drawdown = drawdown.max()

        wins = [t for t in self.trades if t.get("pnl", 0) > 0]
        losses = [t for t in self.trades if t.get("pnl", 0) <= 0]

        win_rate = len(wins) / (len(wins) + len(losses) + 1e-9)

        return {
            "final_equity": equity_series.iloc[-1],
            "total_return": total_return,
            "sharpe_ratio": sharpe,
            "max_drawdown": max_drawdown,
            "win_rate": win_rate,
            "total_trades": len(self.trades),
            "equity_curve": equity_series,
            "trades": self.trades
        }
