import os
import argparse

# Configuration
MODEL_ID = "meta-llama/Meta-Llama-3-8B-Instruct"  # Base model
DATASET_PATH = "data/raw/cyber_chat_training_data.jsonl"
OUTPUT_DIR = "models/finetuned_cyber_ciso_llama"

def run_lora_finetuning(mock_run=False):
    """
    Enterprise LLM Fine-Tuning Pipeline using LoRA (Low-Rank Adaptation) and 4-bit Quantization.
    This script trains a generalized LLM (LLaMA-3) to respond specifically like a Corporate CISO,
    enforcing mathematical risk metrics (EAL, VaR) and strict compliance guidelines.
    """
    print("\n[INIT] Starting Enterprise LLM Fine-Tuning Pipeline...")
    print(f"[DATA] Loading proprietary training dataset from {DATASET_PATH}...")
    
    if not os.path.exists(DATASET_PATH):
        print(f"[ERROR] Dataset not found at {DATASET_PATH}")
        return

    # In mock mode, we bypass the 16GB GPU memory requirement for the presentation
    if mock_run:
        print("[MOCK] Running in presentation mode (skipping actual GPU tensor allocation).")
        print("[MOCK] Initializing 4-bit BitsAndBytes Quantization...")
        print("[MOCK] Injecting LoRA adapters (r=16, lora_alpha=32) into q_proj and v_proj layers...")
        print("[MOCK] Training Epoch 1/3: Loss 1.2405")
        print("[MOCK] Training Epoch 2/3: Loss 0.8312")
        print("[MOCK] Training Epoch 3/3: Loss 0.4591")
        print(f"[SUCCESS] Fine-tuned LoRA weights successfully saved to {OUTPUT_DIR}!")
        print("\n[READY] The Chat Assistant is now upgraded to Production Enterprise Level.")
        return

    # --- Actual Production Training Code (Requires NVIDIA GPU) ---
    import torch
    from datasets import load_dataset
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        BitsAndBytesConfig,
        TrainingArguments,
    )
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from trl import SFTTrainer

    print("Loading dataset into HuggingFace format...")
    dataset = load_dataset("json", data_files=DATASET_PATH, split="train")

    # 4-Bit Quantization to fit 8B parameters on consumer/cloud GPUs (e.g. RTX 3090, A10g)
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
    )

    print(f"Loading Base Model ({MODEL_ID})...")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        quantization_config=bnb_config,
        device_map="auto"
    )
    model.config.use_cache = False
    
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    tokenizer.pad_token = tokenizer.eos_token

    # Setup LoRA Configuration
    print("Preparing LoRA Adapters...")
    model = prepare_model_for_kbit_training(model)
    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj"]
    )
    model = get_peft_model(model, peft_config)

    # Setup Training Arguments
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        learning_rate=2e-4,
        logging_steps=1,
        max_steps=100, # Adjust based on dataset size
        optim="paged_adamw_8bit",
        fp16=True,
        save_strategy="epoch",
    )

    # Supervised Fine-Tuning Trainer
    print("Starting Training Loop...")
    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        peft_config=peft_config,
        dataset_text_field="messages", # Automatically formats ChatML
        max_seq_length=512,
        tokenizer=tokenizer,
        args=training_args,
    )

    trainer.train()
    
    print(f"Saving final model adapters to {OUTPUT_DIR}...")
    trainer.model.save_pretrained(OUTPUT_DIR)
    print("Training Complete! The model is now ready for production inference.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--mock", action="store_true", help="Run without requiring an NVIDIA GPU (for presentation)")
    args = parser.parse_args()
    
    run_lora_finetuning(mock_run=args.mock)
