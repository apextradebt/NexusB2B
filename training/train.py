"""
Fine-tune Qwen2.5-1.5B-Instruct (LoRA) to pick the catalogue model a supplier line names.

    .venv/Scripts/python train.py [--epochs 2] [--batch 16] [--lr 2e-4]

Reads data/train.jsonl and data/valid.jsonl (gen-dataset.ts), writes out/adapter (LoRA weights)
and out/merged (full model, ready for `ollama create`). Only the answer tokens are trained on,
and logits are computed for those positions only, which keeps a batch of 16 within 12 GB.
"""

import argparse
import json
import math
import random
import time
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer

HERE = Path(__file__).parent
BASE = HERE / "models" / "Qwen2.5-1.5B-Instruct"
OUT = HERE / "out"

p = argparse.ArgumentParser()
p.add_argument("--epochs", type=float, default=2)
p.add_argument("--batch", type=int, default=16)
p.add_argument("--lr", type=float, default=2e-4)
p.add_argument("--rank", type=int, default=16)
p.add_argument("--eval-every", type=int, default=200)
p.add_argument("--seed", type=int, default=2026)
args = p.parse_args()

random.seed(args.seed)
torch.manual_seed(args.seed)
device = "cuda"

tok = AutoTokenizer.from_pretrained(BASE)
END = tok.convert_tokens_to_ids("<|im_end|>")


def encode(example):
    """Prompt ids (system + user + assistant header) followed by the answer and <|im_end|>; labels on the answer only."""
    msgs = example["messages"]
    prompt = tok.apply_chat_template(msgs[:2], add_generation_prompt=True, tokenize=False)
    p_ids = tok(prompt, add_special_tokens=False)["input_ids"]
    a_ids = tok(msgs[2]["content"], add_special_tokens=False)["input_ids"] + [END]
    return {"ids": p_ids + a_ids, "start": len(p_ids)}


def load(name):
    with open(HERE / "data" / f"{name}.jsonl", encoding="utf-8") as f:
        return [encode(json.loads(line)) for line in f if line.strip()]


train, valid = load("train"), load("valid")
print(f"{len(train)} train / {len(valid)} valid examples, longest {max(len(e['ids']) for e in train)} tokens")


def batches(data, size, shuffle):
    """Batches of similar length (less padding), in random order when training."""
    order = sorted(range(len(data)), key=lambda i: len(data[i]["ids"]) + (random.random() * 8 if shuffle else 0))
    chunks = [order[i:i + size] for i in range(0, len(order), size)]
    if shuffle:
        random.shuffle(chunks)
    for chunk in chunks:
        items = [data[i] for i in chunk]
        width = max(len(e["ids"]) for e in items)
        ids = torch.full((len(items), width), tok.pad_token_id or END, dtype=torch.long)
        mask = torch.zeros((len(items), width), dtype=torch.long)
        targets = []  # (row, position predicting the token, token)
        for r, e in enumerate(items):
            n = len(e["ids"])
            ids[r, :n] = torch.tensor(e["ids"])
            mask[r, :n] = 1
            for pos in range(e["start"], n):
                targets.append((r, pos - 1, e["ids"][pos]))
        yield ids.to(device), mask.to(device), targets


model = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.bfloat16).to(device)
# Without checkpointing, a batch's activations (~11 GB) spill out of the 12 GB card and training crawls.
model.config.use_cache = False
model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
model = get_peft_model(model, LoraConfig(
    r=args.rank, lora_alpha=2 * args.rank, lora_dropout=0.0, task_type="CAUSAL_LM",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
))
model.print_trainable_parameters()
inner = model.base_model.model  # Qwen2ForCausalLM with LoRA layers inside


def forward(ids, mask, targets):
    """Loss and per-example correctness, computing logits only where the answer is predicted."""
    hidden = inner.model(input_ids=ids, attention_mask=mask).last_hidden_state
    rows = torch.tensor([t[0] for t in targets], device=device)
    cols = torch.tensor([t[1] for t in targets], device=device)
    gold = torch.tensor([t[2] for t in targets], device=device)
    logits = inner.lm_head(hidden[rows, cols]).float()
    loss = torch.nn.functional.cross_entropy(logits, gold)
    hit = logits.argmax(-1) == gold
    # An example is right when every answer token is (teacher forcing = greedy decoding here).
    ok = torch.stack([hit[rows == r].all() for r in range(ids.shape[0])])
    return loss, ok


@torch.no_grad()
def evaluate():
    model.eval()
    right = total = 0
    losses = []
    for ids, mask, targets in batches(valid, 32, shuffle=False):
        loss, ok = forward(ids, mask, targets)
        losses.append(loss.item())
        right += ok.sum().item()
        total += ok.numel()
    model.train()
    return sum(losses) / len(losses), right / total


steps_per_epoch = math.ceil(len(train) / args.batch)
total_steps = int(steps_per_epoch * args.epochs)
warmup = max(10, total_steps // 30)
params = [p for p in model.parameters() if p.requires_grad]
opt = torch.optim.AdamW(params, lr=args.lr, weight_decay=0.0)
sched = torch.optim.lr_scheduler.LambdaLR(
    opt, lambda s: min(1.0, (s + 1) / warmup) * 0.5 * (1 + math.cos(math.pi * min(1.0, s / total_steps))))

loss, acc = evaluate()
print(f"before training: valid loss {loss:.3f}, accuracy {acc:.1%}")
model.train()
step, start, running = 0, time.time(), []
while step < total_steps:
    for ids, mask, targets in batches(train, args.batch, shuffle=True):
        loss, _ = forward(ids, mask, targets)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(params, 1.0)
        opt.step()
        sched.step()
        opt.zero_grad(set_to_none=True)
        running.append(loss.item())
        step += 1
        if step % 25 == 0 or step <= 5:
            print(f"step {step}/{total_steps}  loss {sum(running) / len(running):.4f}  {time.time() - start:.0f}s", flush=True)
            running = []
        if step % args.eval_every == 0 or step == total_steps:
            vloss, vacc = evaluate()
            print(f"  valid loss {vloss:.4f}, accuracy {vacc:.1%}", flush=True)
        if step >= total_steps:
            break

OUT.mkdir(exist_ok=True)
model.save_pretrained(OUT / "adapter")
merged = model.merge_and_unload()
merged.save_pretrained(OUT / "merged", safe_serialization=True)
tok.save_pretrained(OUT / "merged")
print(f"done in {time.time() - start:.0f}s: {OUT / 'merged'}")
