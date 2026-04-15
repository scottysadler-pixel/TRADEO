#!/usr/bin/env python3
"""
Score financial headlines with FinBERT (ProsusAI/finbert) and write daily averages.

FinBERT is a BERT model fine-tuned on financial text (Reuters TRC2 + Financial PhraseBank).
It outperforms VADER / keyword methods on headlines because it encodes financial context
(e.g. "cut" is negative in "rate cut" but not necessarily in other phrases).

Install: pip install -r aud_strategy/requirements-finbert.txt

Usage (from repo root):
  python aud_strategy/scripts/score_sentiment.py --headlines data/headlines.csv --out data/sentiment.csv
"""

from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from pathlib import Path


def main() -> int:
    import torch
    from transformers import BertForSequenceClassification, BertTokenizer

    parser = argparse.ArgumentParser(description="FinBERT daily sentiment from headlines CSV.")
    parser.add_argument("--headlines", type=Path, required=True, help="CSV with date, headline")
    parser.add_argument("--out", type=Path, required=True, help="Output CSV: date, sentiment_score")
    parser.add_argument(
        "--model",
        default="ProsusAI/finbert",
        help="HuggingFace model id (default ProsusAI/finbert)",
    )
    args = parser.parse_args()

    model_name = args.model
    tokenizer = BertTokenizer.from_pretrained(model_name)
    model = BertForSequenceClassification.from_pretrained(model_name)
    model.eval()

    id2label = {int(k): str(v).lower() for k, v in model.config.id2label.items()}
    pos_i = next((i for i, lab in id2label.items() if "pos" in lab), 0)
    neg_i = next((i for i, lab in id2label.items() if "neg" in lab), 1)

    by_date: dict[str, list[float]] = defaultdict(list)

    with args.headlines.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            d = row["date"].strip()
            headline = row.get("headline", "").strip()
            if not headline:
                continue
            inputs = tokenizer(
                headline,
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors="pt",
            )
            with torch.no_grad():
                outputs = model(**inputs)
            probs = torch.nn.functional.softmax(outputs.logits, dim=-1)[0]
            score = float(probs[pos_i] - probs[neg_i])  # bullish minus bearish mass
            by_date[d].append(score)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "sentiment_score"])
        for d in sorted(by_date.keys()):
            avg = sum(by_date[d]) / len(by_date[d])
            w.writerow([d, f"{avg:.6f}"])

    print(f"Wrote {args.out} ({len(by_date)} days).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
