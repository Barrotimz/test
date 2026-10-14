# Ledger

A local desk for Aion 2 crafting. It reads [Aion2Market](https://aion2.exchange/) and shows where a recipe still pays after exchange fees, using the lower of the cheapest ask and the 28-day average sale.

```bash
python3 -m aion_desk.server
```

Open http://127.0.0.1:8787

The public craft model currently covers Artisan's Splendent gear (and the Splendent and Expert stops under it). Mastery is assumed at 100. Fee presets follow community figures for the world exchange (20% sale + 2% listing) and the server exchange (10% + 2%). Change them to match the board you list on.
