import { OperatorRole } from '../types/protocol.js';
export interface PendingApprovalRequest {
    id: string;
    action: string;
    parameters: Record<string, unknown>;
    operatorRoleRequired: OperatorRole;
    riskScore: number;
    token: string;
    createdAt: number;
    expiresAt: number;
}
/**
 * Human Approval Gatekeeper with Cryptographic HMAC-SHA256 Token Verification.
 *
 * NOTE - NON-PRODUCTION SECURITY DEMONSTRATION:
 * In enterprise production, HMAC secrets must be injected from AWS KMS / HashiCorp Vault,
 * approval tokens must use single-use cryptographic nonces stored in Redis/DB,
 * and operator roles must be verified via signed OIDC / JWT session claims.
 */
export declare class HumanApprovalGate {
    private secretKey;
    private pendingRequests;
    private consumedTokens;
    constructor(secretKey?: string);
    /**
     * Generates a cryptographic verification token binding the request ID, action, parameters, and expiry.
     */
    generateToken(requestId: string, action: string, parameters: Record<string, unknown>, expiresAt: number): string;
    /**
     * Evaluates operational risk and registers an approval gate if risk exceeds threshold.
     */
    evaluateRiskAndRegister(action: string, parameters: Record<string, unknown>, ttlSeconds?: number): {
        requiresApproval: boolean;
        request?: PendingApprovalRequest;
    };
    /**
     * Validates human operator consent with HMAC token and RBAC role hierarchy.
     */
    verifyAndApprove(requestId: string, token: string, operatorRole: string): {
        success: boolean;
        error?: string;
        request?: PendingApprovalRequest;
    };
    getPendingRequests(): PendingApprovalRequest[];
}
