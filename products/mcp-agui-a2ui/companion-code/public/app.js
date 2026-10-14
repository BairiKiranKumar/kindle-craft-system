/**
 * Enterprise Support Dashboard Frontend Client
 * Consumes AG-UI SSE stream, renders A2UI v0.9.1 generative cards,
 * and handles cryptographically verified Human-in-the-Loop approvals.
 */

(function () {
  'use strict';

  // DOM Elements
  const connectionStatus = document.getElementById('connection-status');
  const agentStateBadge = document.getElementById('agent-state-badge');
  const activeOrderBadge = document.getElementById('active-order-badge');
  const chatTranscript = document.getElementById('chat-transcript');
  const telemetryPills = document.getElementById('telemetry-pills');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const a2uiCanvas = document.getElementById('a2ui-canvas');
  const emptyState = document.getElementById('empty-state');
  const alertContainer = document.getElementById('alert-container');
  const auditLedger = document.getElementById('audit-ledger');
  const auditCount = document.getElementById('audit-count');
  const operatorRoleSelect = document.getElementById('operator-role');
  const btnReset = document.getElementById('btn-reset');

  let activeEventSource = null;
  let currentStreamingMessageEl = null;

  // Initialize SSE Connection
  function initEventSource() {
    if (activeEventSource) {
      activeEventSource.close();
    }

    connectionStatus.className = 'connection-status';
    connectionStatus.querySelector('.status-label').textContent = 'Connecting SSE...';

    activeEventSource = new EventSource('/api/agent/stream');

    activeEventSource.onopen = () => {
      connectionStatus.className = 'connection-status connected';
      connectionStatus.querySelector('.status-label').textContent = 'AG-UI SSE Connected';
    };

    activeEventSource.onerror = () => {
      connectionStatus.className = 'connection-status error';
      connectionStatus.querySelector('.status-label').textContent = 'Reconnecting...';
    };

    // 1. run_start
    activeEventSource.addEventListener('run_start', (e) => {
      const data = JSON.parse(e.data);
      setAgentStatus('THINKING');
      clearTelemetry();
      addTelemetryPill(`run:${data.runId.substring(0, 8)}`, 'running');
      startNewAssistantMessage();
    });

    // 2. message_delta
    activeEventSource.addEventListener('message_delta', (e) => {
      const data = JSON.parse(e.data);
      appendMessageDelta(data.delta);
    });

    // 3. tool_call
    activeEventSource.addEventListener('tool_call', (e) => {
      const data = JSON.parse(e.data);
      setAgentStatus('EXECUTING_TOOL');
      addTelemetryPill(`MCP: ${data.name}`, 'running', data.callId);
    });

    // 4. tool_result
    activeEventSource.addEventListener('tool_result', (e) => {
      const data = JSON.parse(e.data);
      updateTelemetryPill(data.callId, data.status, data.durationMs);
    });

    // 5. state_patch
    activeEventSource.addEventListener('state_patch', (e) => {
      const data = JSON.parse(e.data);
      handleStatePatch(data.patches);
    });

    // 6. interrupt (Human in the loop approval required)
    activeEventSource.addEventListener('interrupt', (e) => {
      const data = JSON.parse(e.data);
      setAgentStatus('AWAITING_APPROVAL');
      renderInterruptActionCard(data);
    });

    // 7. run_finish
    activeEventSource.addEventListener('run_finish', (e) => {
      const data = JSON.parse(e.data);
      setAgentStatus('IDLE');
      finishAssistantMessage();
      refreshAuditLedger();
    });

    // 8. error
    activeEventSource.addEventListener('error', (e) => {
      if (e.data) {
        try {
          const err = JSON.parse(e.data);
          showAlert(`Protocol Error [${err.code}]: ${err.message}`, 'danger');
        } catch (_) {}
      }
    });
  }

  // Agent Status Badge
  function setAgentStatus(status) {
    agentStateBadge.textContent = status;
    agentStateBadge.className = 'badge ' + status.toLowerCase();
  }

  // Telemetry Pills
  function clearTelemetry() {
    telemetryPills.innerHTML = '';
  }

  function addTelemetryPill(label, state, callId) {
    const pill = document.createElement('span');
    pill.className = `telemetry-pill ${state}`;
    pill.textContent = label;
    if (callId) pill.id = `pill-${callId}`;
    telemetryPills.appendChild(pill);
  }

  function updateTelemetryPill(callId, status, durationMs) {
    const pill = document.getElementById(`pill-${callId}`);
    if (pill) {
      pill.className = `telemetry-pill ${status}`;
      pill.textContent = `${pill.textContent} (${durationMs || 0}ms)`;
    }
  }

  // Message Streaming
  function addUserMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'message user-message';
    msg.textContent = text;
    chatTranscript.appendChild(msg);
    scrollChat();
  }

  function startNewAssistantMessage() {
    const msg = document.createElement('div');
    msg.className = 'message agent-message';
    msg.innerHTML = '<span class="text-body"></span><span class="typing-cursor"></span>';
    chatTranscript.appendChild(msg);
    currentStreamingMessageEl = msg;
    scrollChat();
  }

  function appendMessageDelta(delta) {
    if (!currentStreamingMessageEl) {
      startNewAssistantMessage();
    }
    const body = currentStreamingMessageEl.querySelector('.text-body');
    if (body) {
      body.textContent += delta;
      scrollChat();
    }
  }

  function finishAssistantMessage() {
    if (currentStreamingMessageEl) {
      const cursor = currentStreamingMessageEl.querySelector('.typing-cursor');
      if (cursor) cursor.remove();
      currentStreamingMessageEl = null;
    }
  }

  function scrollChat() {
    chatTranscript.scrollTop = chatTranscript.scrollHeight;
  }

  // State Patch Application (RFC 6902)
  function handleStatePatch(patches) {
    if (!Array.isArray(patches)) return;

    for (const p of patches) {
      if (p.path === '/selectedOrderId' && p.value) {
        activeOrderBadge.textContent = `ORDER #${p.value}`;
      }
      if (p.path === '/order/status' && p.value) {
        // Update any rendered card badges
        const badges = document.querySelectorAll('.order-summary .badge');
        badges.forEach((b) => {
          b.textContent = String(p.value);
          b.className = `badge ${String(p.value).toLowerCase()}`;
        });
      }
    }
  }

  // Render Interrupt Action Card
  function renderInterruptActionCard(data) {
    if (emptyState) emptyState.style.display = 'none';

    // Remove any existing pending approval cards
    const existing = document.getElementById(`approval-${data.interruptId}`);
    if (existing) existing.remove();

    const card = document.createElement('div');
    card.className = 'a2ui-card refund-action-card';
    card.id = `approval-${data.interruptId}`;
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-labelledby', `title-${data.interruptId}`);
    card.setAttribute('tabindex', '0');

    const amount = Number(data.parameters.amountUsd || 0).toFixed(2);
    const orderId = data.parameters.orderId || 'N/A';
    const reason = data.parameters.reason || 'N/A';

    card.innerHTML = `
      <div class="card-warning-header" id="title-${data.interruptId}">
        <span aria-hidden="true">⚠️</span>
        <span>Human Authorization Gate: ${data.action}</span>
        <span class="badge role-badge">${data.requiredRole} REQUIRED</span>
      </div>
      <div class="card-body">
        <p>Authorize financial refund of <strong>$${amount}</strong> for Order <code>${orderId}</code>?</p>
        <p class="reason-text"><strong>Justification:</strong> ${reason}</p>
        <p class="token-meta"><strong>HMAC Token:</strong> <code>${(data.token || '').substring(0, 16)}...</code></p>
      </div>
      <div class="action-buttons">
        <button class="btn btn-reject" data-action="reject" data-id="${data.interruptId}">Reject Request</button>
        <button class="btn btn-approve" data-action="approve" data-id="${data.interruptId}" data-token="${data.token}">Approve Refund ($${amount})</button>
      </div>
    `;

    // Hook click listeners
    card.querySelector('.btn-reject').addEventListener('click', () => {
      sendApprovalDecision(data.interruptId, data.token, 'REJECT');
    });

    card.querySelector('.btn-approve').addEventListener('click', () => {
      sendApprovalDecision(data.interruptId, data.token, 'APPROVE');
    });

    // Keyboard support: Enter or Space on card buttons
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        sendApprovalDecision(data.interruptId, data.token, 'REJECT');
      }
    });

    a2uiCanvas.prepend(card);
    card.focus();
  }

  // Send Human Approval Decision
  async function sendApprovalDecision(interruptId, token, decision) {
    const operatorRole = operatorRoleSelect.value;

    try {
      const resp = await fetch('/api/agent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interruptId,
          token,
          decision,
          operatorRole,
          operatorId: `operator_${operatorRole.toLowerCase()}`,
        }),
      });

      const result = await resp.json();
      const card = document.getElementById(`approval-${interruptId}`);

      if (result.success) {
        showAlert(`Authorization Success: ${decision} executed by ${operatorRole}.`, 'success');
        if (card) card.remove();
        refreshAuditLedger();
      } else {
        showAlert(`Authorization Denied: ${result.error}`, 'danger');
      }
    } catch (err) {
      showAlert(`Network error submitting approval: ${err.message}`, 'danger');
    }
  }

  // Alerts
  function showAlert(msg, type) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = msg;
    alertContainer.prepend(alert);
    setTimeout(() => alert.remove(), 6000);
  }

  // Audit Ledger Fetch
  async function refreshAuditLedger() {
    try {
      const resp = await fetch('/api/audit');
      const data = await resp.json();
      auditCount.textContent = `${data.length} BLOCKS`;

      auditLedger.innerHTML = '';
      data.slice(-5).reverse().forEach((b) => {
        const row = document.createElement('div');
        row.className = 'audit-row';
        row.innerHTML = `
          <span class="audit-index">#${b.index}</span>
          <span class="audit-event">${b.eventType}</span>
          <span class="audit-hash" title="SHA-256 Hash">${b.hash.substring(0, 10)}...</span>
        `;
        auditLedger.appendChild(row);
      });
    } catch (_) {}
  }

  // Chat Form Submit
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    addUserMessage(text);
    chatInput.value = '';
    chatInput.disabled = true;

    try {
      await fetch('/api/agent/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
    } catch (err) {
      showAlert(`Failed to send message: ${err.message}`, 'danger');
    } finally {
      chatInput.disabled = false;
      chatInput.focus();
    }
  });

  // Scenario Chips
  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      chatInput.value = chip.getAttribute('data-prompt');
      chatForm.dispatchEvent(new Event('submit'));
    });
  });

  // Reset State
  btnReset.addEventListener('click', async () => {
    await fetch('/api/reset', { method: 'POST' });
    a2uiCanvas.innerHTML = `
      <div class="empty-state" id="empty-state">
        <div class="empty-icon" aria-hidden="true">📋</div>
        <p>No active generative cards rendered.</p>
        <small>Ask the agent to look up an order or trigger an SLA evaluation to see dynamic A2UI widgets.</small>
      </div>
    `;
    chatTranscript.innerHTML = `
      <div class="message system-message">
        <p><strong>System:</strong> State reset. Ready to process support tickets.</p>
      </div>
    `;
    activeOrderBadge.textContent = 'NO ORDER';
    clearTelemetry();
    showAlert('Mock database state reset successfully.', 'success');
    refreshAuditLedger();
  });

  // Start connection on load
  initEventSource();
  refreshAuditLedger();
})();
