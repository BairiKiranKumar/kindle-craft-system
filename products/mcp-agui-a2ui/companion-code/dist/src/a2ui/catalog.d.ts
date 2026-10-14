import { A2UIv091CatalogEntry, A2UIv091Node, A2UIv10CandidateNode } from '../types/protocol.js';
/**
 * A2UI Component Catalog: Runnable Baseline v0.9.1
 * Validates declarative AST nodes against strict component schemas.
 * Prevents HTML injection (XSS) by whitelisting components and properties.
 */
export declare class A2UIComponentCatalog {
    private entries;
    constructor();
    register(entry: A2UIv091CatalogEntry): void;
    get(type: string): A2UIv091CatalogEntry | undefined;
    validateAndRender(node: A2UIv091Node): {
        isValid: boolean;
        html?: string;
        error?: string;
    };
    private registerDefaultComponents;
}
/**
 * A2UI v1.0 Candidate Features (Documented Separately)
 * Experimental prototype validator demonstrating reactive signal hydration.
 */
export declare class A2UIv10CandidateValidator {
    static validateCandidateNode(node: A2UIv10CandidateNode): boolean;
}
