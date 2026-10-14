# Concept 14: How Reinforcement Learning Works

Pre-training an LLM on the internet produces an unruly next-token predictor. If you ask a raw pre-trained base model *"How do I bake bread?"*, it might respond with another question, a raw forum comment, or a recipe snippet cut off mid-sentence.

To transform this base predictor into a helpful, truthful, and logically coherent assistant, AI research relies on **Reinforcement Learning (RL)**.

In this chapter, we trace the evolution from classic RLHF to modern DPO and the breakthrough reasoning architectures (like DeepSeek-R1 and OpenAI o-series) powered by verifiable reward RL.

---

## 14.1 The Classic RLHF Pipeline (PPO)

```
[ 1. Base Model Pre-Training ]  ---> Billions of tokens of unsupervised internet text
              |
[ 2. Supervised Fine-Tuning ]   ---> Curated prompt-response pairs ("Instruct" model)
              |
[ 3. Reward Model Training ]    ---> Train discriminator on human preference rankings (A > B)
              |
[ 4. Policy Optimization ]      ---> PPO tunes policy to maximize reward with KL penalty
```

In Step 4, **Proximal Policy Optimization (PPO)** optimizes the model's weights to maximize the score given by the Reward Model. To prevent "mode collapse" (where the model outputs repetitive gibberish that tricks the reward model), a **Kullback-Leibler (KL) divergence penalty** penalizes drifts away from the initial SFT base model:

$$\text{Objective} = \mathbb{E}[R(x, y)] - \beta \cdot D_{\text{KL}}(\pi_\theta(y|x) \parallel \pi_{\text{ref}}(y|x))$$

---

## 14.2 The Modern Revolution: Direct Preference Optimization (DPO)

PPO is notoriously brittle: training a separate Reward Model and running four models simultaneously in GPU memory (Policy, Reference, Reward, Value) is computationally demanding and prone to training instability.

**Direct Preference Optimization (DPO)** proved that the implicit reward can be mathematically extracted directly from the policy likelihood ratio. DPO eliminates the separate reward model completely, optimizing the LLM directly on preference pairs $(y_w \succ y_l)$ using a simple binary cross-entropy loss:

$$\mathcal{L}_{\text{DPO}}(\theta) = -\mathbb{E}_{(x, y_w, y_l)}\left[ \log \sigma \left( \beta \log \frac{\pi_\theta(y_w|x)}{\pi_{\text{ref}}(y_w|x)} - \beta \log \frac{\pi_\theta(y_l|x)}{\pi_{\text{ref}}(y_l|x)} \right) \right]$$

---

## 14.3 The New Frontier: RL with Verifiable Rewards (RLVR & GRPO)

The latest breakthrough in AI reasoning - exemplified by models like DeepSeek-R1 and OpenAI's o-series - does not rely on human preference labels. Human graders cannot reliably judge complex mathematical proofs, zero-day security exploits, or multi-thousand line refactors.

Instead, these reasoning models train using **Reinforcement Learning with Verifiable Rewards (RLVR)**:
- The model is given a coding or math problem.
- It generates long chains of thought (CoT) and an answer.
- A deterministic sandbox runs unit tests or checks the mathematical solution.
- If tests pass: **Reward = +1**. If tests fail: **Reward = 0**.

Using algorithms like **Group Relative Policy Optimization (GRPO)**, models spontaneously develop advanced reasoning skills - such as self-reflection, backtracking, and testing alternative hypotheses - purely through the pressure of maximizing verifiable rewards.
