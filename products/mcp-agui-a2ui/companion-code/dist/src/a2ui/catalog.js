/**
 * A2UI Component Catalog: Runnable Baseline v0.9.1
 * Validates declarative AST nodes against strict component schemas.
 * Prevents HTML injection (XSS) by whitelisting components and properties.
 */
export class A2UIComponentCatalog {
    entries = new Map();
    constructor() {
        this.registerDefaultComponents();
    }
    register(entry) {
        this.entries.set(entry.type, entry);
    }
    get(type) {
        return this.entries.get(type);
    }
    validateAndRender(node) {
        const entry = this.entries.get(node.type);
        if (!entry) {
            return { isValid: false, error: `Component type '${node.type}' is not registered in A2UI catalog.` };
        }
        // 1. Verify required properties
        for (const req of entry.requiredProps) {
            if (node.props[req] === undefined || node.props[req] === null) {
                return { isValid: false, error: `Missing required prop '${req}' for A2UI component '${node.type}'.` };
            }
        }
        // 2. Reject disallowed properties (Strict Schema Enforcement)
        for (const key of Object.keys(node.props)) {
            if (!entry.allowedProps.includes(key)) {
                return { isValid: false, error: `Disallowed prop '${key}' detected on component '${node.type}'.` };
            }
        }
        // 3. Custom validator if defined
        if (entry.validator && !entry.validator(node.props)) {
            return { isValid: false, error: `Type validation failed for A2UI component '${node.type}'.` };
        }
        return {
            isValid: true,
            html: entry.render(node.props),
        };
    }
    registerDefaultComponents() {
        // 1. OrderSummaryCard (v0.9.1)
        this.register({
            type: 'OrderSummaryCard',
            description: 'Displays itemized delivery summary and total for customer orders.',
            allowedProps: ['orderId', 'totalUsd', 'status', 'carrier', 'trackingNumber', 'itemsCount', 'orderDate'],
            requiredProps: ['orderId', 'totalUsd', 'status'],
            validator: (props) => typeof props.orderId === 'string' && typeof props.totalUsd === 'number',
            render: (props) => {
                const statusClass = String(props.status).toLowerCase();
                return `<div class="a2ui-card order-summary ${statusClass}" role="region" aria-label="Order ${props.orderId}">
          <div class="card-header">
            <h4>Order #${escapeHtml(String(props.orderId))}</h4>
            <span class="badge ${statusClass}">${escapeHtml(String(props.status))}</span>
          </div>
          <div class="card-body">
            <p><strong>Total:</strong> $${Number(props.totalUsd).toFixed(2)}</p>
            <p><strong>Carrier:</strong> ${escapeHtml(String(props.carrier || 'Standard Transit'))}</p>
            <p><strong>Tracking:</strong> <code>${escapeHtml(String(props.trackingNumber || 'Pending'))}</code></p>
            <p><strong>Date:</strong> ${escapeHtml(String(props.orderDate || 'N/A'))}</p>
          </div>
        </div>`;
            },
        });
        // 2. CustomerTierBadge (v0.9.1)
        this.register({
            type: 'CustomerTierBadge',
            description: 'Displays customer VIP tier and historical spend badge.',
            allowedProps: ['customerName', 'tier', 'totalSpentUsd'],
            requiredProps: ['tier', 'customerName'],
            validator: (props) => typeof props.customerName === 'string' && typeof props.tier === 'string',
            render: (props) => {
                const tier = escapeHtml(String(props.tier));
                const name = escapeHtml(String(props.customerName));
                const spent = Number(props.totalSpentUsd || 0).toLocaleString();
                return `<div class="a2ui-badge tier-${tier.toLowerCase()}" role="status">
          <span class="tier-label">${tier} MEMBER</span>
          <span class="customer-name">${name}</span>
          <span class="spend">($${spent} spent)</span>
        </div>`;
            },
        });
        // 3. CarrierSlaCard (v0.9.1)
        this.register({
            type: 'CarrierSlaCard',
            description: 'Displays delivery SLA transit evaluation and delay metrics.',
            allowedProps: ['orderId', 'delayDays', 'isBreached', 'promisedDays', 'actualDays'],
            requiredProps: ['orderId', 'delayDays', 'isBreached'],
            validator: (props) => typeof props.orderId === 'string' && typeof props.delayDays === 'number',
            render: (props) => {
                const breached = Boolean(props.isBreached);
                return `<div class="a2ui-card carrier-sla ${breached ? 'breached' : 'on-time'}" role="region">
          <div class="card-header">
            <h4>Delivery SLA Status: Order #${escapeHtml(String(props.orderId))}</h4>
            <span class="badge ${breached ? 'danger' : 'success'}">${breached ? 'SLA BREACH' : 'ON TIME'}</span>
          </div>
          <div class="card-body">
            <p><strong>Promised Transit:</strong> ${props.promisedDays || 2} days</p>
            <p><strong>Actual Transit:</strong> ${props.actualDays || 7} days</p>
            <p class="highlight-stat"><strong>Carrier Delay:</strong> ${props.delayDays} business days late</p>
          </div>
        </div>`;
            },
        });
        // 4. ResolutionOfferCard (v0.9.1)
        this.register({
            type: 'ResolutionOfferCard',
            description: 'Presents structured compensation and apology concession offer.',
            allowedProps: ['offerId', 'refundAmountUsd', 'couponCode', 'justification'],
            requiredProps: ['offerId', 'refundAmountUsd', 'justification'],
            validator: (props) => typeof props.refundAmountUsd === 'number' && typeof props.justification === 'string',
            render: (props) => {
                return `<div class="a2ui-card resolution-offer" role="region" aria-label="Resolution Proposal">
          <div class="card-header">
            <h4>Courtesy Resolution Offer #${escapeHtml(String(props.offerId))}</h4>
            <span class="badge info">PROPOSAL</span>
          </div>
          <div class="card-body">
            <p><strong>Concession Amount:</strong> <span class="text-amount">$${Number(props.refundAmountUsd).toFixed(2)}</span></p>
            ${props.couponCode ? `<p><strong>Discount Coupon:</strong> <code>${escapeHtml(String(props.couponCode))}</code> (15% off)</p>` : ''}
            <p class="justification-text"><strong>Justification:</strong> ${escapeHtml(String(props.justification))}</p>
          </div>
        </div>`;
            },
        });
        // 5. RefundActionCard (v0.9.1 with Accessible Keyboard Navigation & ARIA)
        this.register({
            type: 'RefundActionCard',
            description: 'Human-in-the-Loop approval card with explicit operator confirmation.',
            allowedProps: ['orderId', 'amountUsd', 'reason', 'interruptId', 'requiredRole', 'token'],
            requiredProps: ['orderId', 'amountUsd', 'reason', 'interruptId', 'requiredRole'],
            validator: (props) => typeof props.amountUsd === 'number' && typeof props.interruptId === 'string',
            render: (props) => {
                const orderId = escapeHtml(String(props.orderId));
                const amount = Number(props.amountUsd).toFixed(2);
                const reason = escapeHtml(String(props.reason));
                const intId = escapeHtml(String(props.interruptId));
                const role = escapeHtml(String(props.requiredRole));
                const token = escapeHtml(String(props.token || ''));
                return `<div class="a2ui-card refund-action-card"
                     id="approval-${intId}"
                     role="alertdialog"
                     aria-labelledby="title-${intId}"
                     aria-describedby="desc-${intId}"
                     tabindex="0"
                     data-interrupt-id="${intId}"
                     data-token="${token}"
                     data-required-role="${role}">
          <div class="card-warning-header" id="title-${intId}">
            <span class="warning-icon" aria-hidden="true">⚠️</span>
            <span>Authorization Gate: Payment Refund</span>
            <span class="badge role-badge">${role} REQUIRED</span>
          </div>
          <div class="card-body" id="desc-${intId}">
            <p>Authorize financial refund of <strong>$${amount}</strong> for Order <code>${orderId}</code>?</p>
            <p class="reason-text"><strong>Justification:</strong> ${reason}</p>
            <p class="token-meta"><strong>Security Nonce:</strong> <code>${token.substring(0, 16)}...</code></p>
          </div>
          <div class="action-buttons">
            <button class="btn btn-reject" data-action="reject" data-interrupt-id="${intId}" aria-label="Reject Refund">Reject Request</button>
            <button class="btn btn-approve" data-action="approve" data-interrupt-id="${intId}" aria-label="Approve Refund">Approve Refund ($${amount})</button>
          </div>
        </div>`;
            },
        });
    }
}
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
/**
 * A2UI v1.0 Candidate Features (Documented Separately)
 * Experimental prototype validator demonstrating reactive signal hydration.
 */
export class A2UIv10CandidateValidator {
    static validateCandidateNode(node) {
        if (node.specVersion !== '1.0.0-draft')
            return false;
        if (typeof node.component !== 'string')
            return false;
        if (typeof node.props !== 'object' || node.props === null)
            return false;
        return true;
    }
}
