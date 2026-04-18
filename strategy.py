
class ExampleStrategy:
    def generate_signals(self, df):
        df["signal"] = 0

        df["ma_fast"] = df["close"].rolling(10).mean()
        df["ma_slow"] = df["close"].rolling(30).mean()

        df.loc[df["ma_fast"] > df["ma_slow"], "signal"] = 1
        df.loc[df["ma_fast"] < df["ma_slow"], "signal"] = -1

        return df
