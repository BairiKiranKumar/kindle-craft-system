import { describe, it } from 'node:test';
import assert from 'node:assert';
import { A2UIParser } from '../src/a2ui/parser.js';
import { A2UIComponentCatalog, A2UIv10CandidateValidator } from '../src/a2ui/catalog.js';
describe('A2UI Generative Catalog & DSL Suite (Baseline Spec v0.9.1)', () => {
    const catalog = new A2UIComponentCatalog();
    it('should parse A2UI DSL tokens into typed AST nodes with v0.9.1 baseline tag', () => {
        const dsl = 'OrderSummaryCard[orderId="ord_5521", totalUsd=149.50, status="DELIVERED", itemsCount=2]';
        const nodes = A2UIParser.parseDsl(dsl);
        assert.strictEqual(nodes.length, 1);
        assert.strictEqual(nodes[0].version, '0.9.1');
        assert.strictEqual(nodes[0].type, 'OrderSummaryCard');
        assert.strictEqual(nodes[0].props.orderId, 'ord_5521');
        assert.strictEqual(nodes[0].props.totalUsd, 149.5);
        assert.strictEqual(nodes[0].props.status, 'DELIVERED');
    });
    it('should validate and render registered catalog component', () => {
        const node = {
            version: '0.9.1',
            type: 'OrderSummaryCard',
            props: {
                orderId: 'ord_101',
                totalUsd: 89.99,
                status: 'DELIVERED',
                itemsCount: 1,
            },
        };
        const result = catalog.validateAndRender(node);
        assert.strictEqual(result.isValid, true);
        assert.ok(result.html?.includes('Order #ord_101'));
        assert.ok(result.html?.includes('$89.99'));
    });
    it('should render accessible RefundActionCard with ARIA dialog and focus markers', () => {
        const node = {
            version: '0.9.1',
            type: 'RefundActionCard',
            props: {
                orderId: 'ord_8801',
                amountUsd: 45.00,
                reason: '5-day carrier delivery delay',
                interruptId: 'int_7701',
                requiredRole: 'TEAM_LEAD',
                token: 'token_hmac_abc123',
            },
        };
        const result = catalog.validateAndRender(node);
        assert.strictEqual(result.isValid, true);
        assert.ok(result.html?.includes('role="alertdialog"'));
        assert.ok(result.html?.includes('tabindex="0"'));
        assert.ok(result.html?.includes('TEAM_LEAD REQUIRED'));
        assert.ok(result.html?.includes('$45.00'));
    });
    it('should reject unregistered component type (XSS defense)', () => {
        const node = {
            version: '0.9.1',
            type: 'MaliciousScriptTag',
            props: { src: 'https://evil.com/hack.js' },
        };
        const result = catalog.validateAndRender(node);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.error?.includes('not registered'));
    });
    it('should reject component with disallowed arbitrary properties', () => {
        const node = {
            version: '0.9.1',
            type: 'OrderSummaryCard',
            props: {
                orderId: 'ord_101',
                totalUsd: 89.99,
                status: 'DELIVERED',
                injectedOnLoad: 'alert(1)', // Disallowed prop
            },
        };
        const result = catalog.validateAndRender(node);
        assert.strictEqual(result.isValid, false);
        assert.ok(result.error?.includes('Disallowed prop'));
    });
    it('should validate v1.0 candidate features separately without contaminating v0.9.1 schema', () => {
        const v10CandidateNode = {
            specVersion: '1.0.0-draft',
            component: 'ReactiveOrderBadge',
            props: { orderId: 'ord_8801' },
            signals: { statusSignal: 'order.status' },
            isStreamingDelta: true,
        };
        const isValid = A2UIv10CandidateValidator.validateCandidateNode(v10CandidateNode);
        assert.strictEqual(isValid, true);
    });
});
