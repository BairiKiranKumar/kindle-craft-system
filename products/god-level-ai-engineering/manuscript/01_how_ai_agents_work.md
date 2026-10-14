# Concept 1: How AI Agents Work

At its core, an **AI Agent** is an autonomous control system driven by a foundation model that pursues a specified objective by executing an iterative loop of perception, planning, action, and reflection.

While a raw LLM is stateless and reactive (emitting text only when prompted), an agent possesses an execution harness that allows it to interact with the external world through tools, maintain long-term memory, and self-correct when actions fail.

---

## 1.1 The Anatomy of the Agentic Control Loop

The dominant architectural paradigm for autonomous agents is the **ReAct (Reasoning + Acting)** framework. Instead of predicting an answer in a single forward pass, the model alternates between verbal reasoning traces and tool invocations:

```
                  +-----------------------------------+
                  |          User Objective           |
                  +-----------------+-----------------+
                                    |
                                    v
                         +--------------------+
               +-------->| 1. PERCEPTION      | (Inject state, history & tool schema)
               |         +----------+---------+
               |                    |
               |                    v
               |         +--------------------+
               |         | 2. REASONING       | (Generate "Thought" & plan next step)
               |         +----------+---------+
               |                    |
               |                    v
               |         +--------------------+
               |         | 3. ACTION (Tool)   | (Emit structured JSON tool call)
               |         +----------+---------+
               |                    |
               |                    v
               |         +--------------------+
               |         | 4. OBSERVATION     | (Execute tool in environment & return result)
               |         +----------+---------+
               |                    |
               +--------------------+
                  Evaluate: Goal Reached or Next Iteration?
```

### The Trace Structure

In production systems, each iteration is appended to the message array with typed roles:
1. `user`: Objective specification.
2. `assistant` (with `tool_calls`): The agent's thought process and proposed function invocation.
3. `tool`: The environment's response (database output, API payload, or error trace).

---

## 1.2 Tool Calling Mechanics at the Protocol Level

Modern LLMs (such as GPT-4o, Claude 3.5 Sonnet, and Gemini 1.5 Pro) have been fine-tuned using reinforcement learning to recognize tool schemas formatted as JSON Schemas.

When an agent decides to act, it halts natural text generation and emits a constrained JSON payload:

```json
{
  "role": "assistant",
  "content": "To calculate the user's portfolio risk, I must first retrieve the current asset holdings.",
  "tool_calls": [
    {
      "id": "call_acc_902",
      "type": "function",
      "function": {
        "name": "fetchUserPortfolio",
        "arguments": "{\"userId\": \"usr_4481\", \"includeCash\": true}"
      }
    }
  ]
}
```

The runtime harness intercepts this call, executes the underlying database query or HTTP request, and returns:

```json
{
  "role": "tool",
  "tool_call_id": "call_acc_902",
  "content": "{\"holdings\": [{\"symbol\": \"AAPL\", \"shares\": 50}, {\"symbol\": \"NVDA\", \"shares\": 20}], \"cashUsd\": 12400}"
}
```

---

## 1.3 Key Failure Modes in Agentic Loops

When building production agents, watch out for these three failure modes:

1. **Infinite Loops (Action Thrashing):** The agent receives an error from a tool, attempts the exact same tool call with identical arguments, and repeats endlessly until hitting the token limit.
   - *Mitigation:* Implement an iteration budget (`max_iterations = 10`) and a deduplication guardrail that aborts if the same tool signature is executed twice consecutively.
2. **Context Saturation:** As intermediate tool outputs accumulate, the context window fills with raw JSON dumps, diluting the agent's attention.
   - *Mitigation:* Context compaction (summarizing past observations before appending new ones).
3. **Premature Termination:** The agent hallucinates that it has completed the goal without actually invoking the final validation tool.
   - *Mitigation:* Require a cryptographic execution receipt from a verification tool before accepting task completion.
