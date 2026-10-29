## nexus-matcher: the local matching model

A small model (Qwen2.5-1.5B-Instruct, Apache-2.0) fine-tuned for one job: given a supplier line and up to 12 catalogue candidates (`candidatesFor` in `src/lib/aiMatch.ts`, plus the rules' own pick), answer with the number of the candidate that is the same model, or 0. It runs locally in [Ollama](https://ollama.com), behind the Nexus backend (`POST /api/b2b/resolve`, `B2C-Backend/src/logic/b2bMatch.ts`): free, nothing leaves the machine, a few tens of milliseconds per line on the GPU.

Ollama only runs models; the training itself is Python (PyTorch + PEFT LoRA) on the NVIDIA card. Tested on an RTX 5070 (12 GB), which needs PyTorch built for CUDA 12.8.

### Setup (once, ~6.5 GB)

```bash
cd training
python -m venv .venv
.venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cu128
.venv/Scripts/python -m pip install transformers peft accelerate safetensors huggingface_hub
.venv/Scripts/python -c "from huggingface_hub import snapshot_download; snapshot_download('Qwen/Qwen2.5-1.5B-Instruct', local_dir='models/Qwen2.5-1.5B-Instruct')"
# Ollama 0.40 cannot import a fine-tuned Qwen2 from safetensors ("unsupported MLX architecture"): llama.cpp converts it to GGUF.
git clone --depth 1 https://github.com/ggml-org/llama.cpp llama.cpp
.venv/Scripts/python -m pip install ./llama.cpp/gguf-py sentencepiece
```

`.venv/`, `models/`, `data/`, `out/` and `llama.cpp/` are git-ignored.

### Train and install

```bash
npx tsx training/gen-dataset.ts          # from nexusb2b/: ~10 000 lines generated from the catalogue
cd training
.venv/Scripts/python train.py            # ~20 min, writes out/merged
.venv/Scripts/python llama.cpp/convert_hf_to_gguf.py out/merged --outtype q8_0 --outfile out/nexus-matcher-q8_0.gguf
ollama create nexus-matcher -f Modelfile
.venv/Scripts/python eval.py             # accuracy and speed through Ollama, next to the rules alone
```

To judge it on real supplier files, `npx tsx training/check-lots.ts <files>` prints what the model would pick for the lines the rules did not settle, and `npx tsx training/audit-ai.ts <files>` runs the whole recognition as the app does (rules, AI, answers applied) and lists the lines the AI changed, removed or left without a configuration.

Then start the backend as usual: it calls Ollama on `http://127.0.0.1:11434` (`OLLAMA_URL`, `B2B_AI_MODEL` to change).

### The data

`gen-dataset.ts` writes each catalogue model the many ways suppliers do: shorthand (MBP, TP, EB, SGS21), generations ("G 8", "8th Gen", "Gen.8"), glued numbers ("840G5", "iPhone12"), typos, brand left out or spelled out, CPU / RAM / storage in every format, grade, quantity, price, colour, keyboard. Each line gets the candidates the app would send. One line in six has its model taken out of the candidates (answer 0, as for a model missing from the catalogue), and tablets, watches, accessories and headings teach it to answer 0 to what is not a quoted device. Lines the rules already settle are kept at one in three, so the data leans towards the hard ones; the model is asked about every line in the app, and is scored on all of them by `eval.py`.

`test-unseen` holds 8 % of the catalogue models, never seen in training: it shows how the model copes with entries added to the catalogue later.

### Retraining

Retrain when the catalogue grows a lot or when the recognition feedback (`b2bMatchFeedback` in MongoDB: what the user kept for each line) shows systematic mistakes; the feedback lines can be added to the data as real examples. The prompt format lives in two places, `gen-dataset.ts` and `b2bMatch.ts`: change both, then regenerate and retrain.
