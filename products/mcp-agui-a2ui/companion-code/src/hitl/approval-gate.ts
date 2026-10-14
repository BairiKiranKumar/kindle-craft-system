import { createHmac } from 'crypto';
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
export class HumanApprovalGate {
  private secretKey: string;
  private pendingRequests: Map<string, PendingApprovalRequest> = new Map();
  private consumedTokens: Set<string> = new Set();

  constructor(secretKey = 'dev_hitl_secret_key_change_in_prod') {
    this.secretKey = secretKey;
  }

  /**
   * Generates a cryptographic verification token binding the request ID, action, parameters, and expiry.
   */
  public generateToken(requestId: string, action: string, parameters: Record<string, unknown>, expiresAt: number): string {
    const sortedParams = JSON.stringify(parameters, Object.keys(parameters).sort());
    const payload = `${requestId}:${action}:${sortedParams}:${expiresAt}`;
    return createHmac('sha256', this.secretKey).update(payload).digest('hex');
  }

  /**
   * Evaluates operational risk and registers an approval gate if risk exceeds threshold.
   */
  public evaluateRiskAndRegister(
    action: string,
    parameters: Record<string, unknown>,
    ttlSeconds = 300
  ): { requiresApproval: boolean; request?: PendingApprovalRequest } {
    let riskScore = 0;
    let requiredRole: OperatorRole = 'SUPPORT_AGENT';

    if (action === 'requestRefund') {
      const amount = Number(parameters.amountUsd || parameters.amount || 0);
      if (amount > 200) {
        riskScore = 90;
        requiredRole = 'FINANCE_ADMIN';
      } else if (amount > 25) {
        riskScore = 60;
        requiredRole = 'TEAM_LEAD';
      } else {
        riskScore = 20;
        requiredRole = 'SUPPORT_AGENT';
      }
    }

    if (riskScore >= 50) {
      const id = `apr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const expiresAt = Date.now() + ttlSeconds * 1000;
      const token = this.generateToken(id, action, parameters, expiresAt);

      const request: PendingApprovalRequest = {
        id,
        action,
        parameters,
        operatorRoleRequired: requiredRole,
        riskScore,
        token,
        createdAt: Date.now(),
        expiresAt,
      };

      this.pendingRequests.set(id, request);
      return { requiresApproval: true, request };
    }

    return { requiresApproval: false };
  }

  /**
   * Validates human operator consent with HMAC token and RBAC role hierarchy.
   */
  public verifyAndApprove(
    requestId: string,
    token: string,
    operatorRole: string
  ): { success: boolean; error?: string; request?: PendingApprovalRequest } {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return { success: false, error: 'Approval request not found or already consumed.' };
    }

    if (Date.now() > pending.expiresAt) {
      this.pendingRequests.delete(requestId);
      return { success: false, error: 'Approval ticket has expired.' };
    }

    if (this.consumedTokens.has(token)) {
      return { success: false, error: 'Replay attack detected. Token has already been consumed.' };
    }

    // Role hierarchy check
    const roleHierarchy: Record<string, number> = {
      SUPPORT_AGENT: 1,
      SUPPORT_REP: 1, // alias
      TEAM_LEAD: 2,
      FINANCE_ADMIN: 3,
      FINANCE_MANAGER: 3, // alias
    };

    const userLevel = roleHierarchy[operatorRole] || 0;
    const requiredLevel = roleHierarchy[pending.operatorRoleRequired] || 0;

    if (userLevel < requiredLevel) {
      return {
        success: false,
        error: `Operator role '${operatorRole}' lacks authority. Requires '${pending.operatorRoleRequired}'.`,
      };
    }

    // Cryptographic token verification
    const expectedToken = this.generateToken(pending.id, pending.action, pending.parameters, pending.expiresAt);
    if (token !== expectedToken) {
      return { success: false, error: 'Cryptographic token mismatch. Parameters may have been tampered.' };
    }

    // Mark token as consumed to prevent replay attacks
    this.consumedTokens.add(token);
    this.pendingRequests.delete(requestId);

    return { success: true, request: pending };
  }

  public getPendingRequests(): PendingApprovalRequest[] {
    return Array.from(this.pendingRequests.values());
  }
}
