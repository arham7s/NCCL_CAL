# NCCL CAL

NCCL CAL is a standalone India-focused broker-style margin calculator built in a
separate folder from the rest of this repo.

It is designed to feel closer to an Indian broker margin tool than the earlier
generic SPAN demo:

- INR-denominated throughout
- exchange-aware coverage for `NSE`, `BSE`, `MCX`, and `NCDEX`
- clearing references for `NSE Clearing`, `ICCL`, and `NCCL`
- equity cash modeled with `VaR + ELM + ad hoc`
- derivatives modeled with `SPAN-style 16-scenario scan risk`
- exposure, additional, delivery, premium, and short-option floor components
- hedge benefit visibility from grouped scenario netting

## Project Structure

- `app.py`: local web server and JSON API
- `broker_catalog.py`: Indian contract presets, exchange metadata, and samples
- `margin_engine.py`: broker-style calculation logic
- `web/`: polished frontend

## Run

```bash
cd "/Users/arhamshah/Documents/New project/NCCL_CAL"
python3 app.py
```

Then open:

`http://127.0.0.1:8181`

![Website]()

## Notes

- This app uses realistic Indian market terminology and exchange-style margin
  buckets, but it is still a modeling and design tool rather than a live broker
  or exchange-connected calculator.
- The presets are intentionally editable, so you can adapt the prices and
  quantities to match your own assumptions or contract sheets.
- Official reference surfaces used for terminology and structure are linked
  inside the app.
