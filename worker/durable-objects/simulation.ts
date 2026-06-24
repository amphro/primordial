// Re-export from shared — the real implementation lives in shared/sim/simulation.ts.
// This shim keeps existing relative imports in other worker files working.
export * from '../../shared/sim/simulation'
