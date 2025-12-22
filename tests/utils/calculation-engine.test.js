/**
 * Test per js/utils/calculation-engine.js
 * Business logic critica per calcoli chiusura turno
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculationEngine, CALCULATION_SCOPES } from '../../js/utils/calculation-engine.js';
import { mockSupabase } from '../mocks/supabase.js';

describe('CalculationEngine', () => {
    beforeEach(() => {
        mockSupabase.reset();
        calculationEngine.clearCache();
    });

    describe('DSL Validation', () => {
        it('should validate correct DSL structure', () => {
            const validDsl = {
                version: "1.0",
                steps: [
                    {
                        id: "step1",
                        operation: "SUM",
                        inputs: ["value1", "value2"],
                        output: "total"
                    }
                ]
            };

            // Dovrebbe non lanciare errori
            expect(() => calculationEngine.compile(validDsl)).not.toThrow();
        });

        it('should reject invalid DSL version', () => {
            const invalidDsl = {
                version: "99.0", // versione non supportata
                steps: []
            };

            expect(() => calculationEngine.compile(invalidDsl)).toThrow();
        });

        it('should reject DSL without steps', () => {
            const invalidDsl = {
                version: "1.0"
                // missing steps
            };

            expect(() => calculationEngine.compile(invalidDsl)).toThrow();
        });

        it('should reject step with unknown operation', () => {
            const invalidDsl = {
                version: "1.0",
                steps: [{
                    id: "step1",
                    operation: "UNKNOWN_OP",
                    inputs: [],
                    output: "result"
                }]
            };

            expect(() => calculationEngine.compile(invalidDsl)).toThrow();
        });
    });

    describe('Basic Operations', () => {
        it('should execute SUM operation', async () => {
            const dsl = {
                version: "1.0",
                steps: [{
                    id: "sum_step",
                    operation: "SUM",
                    inputs: ["cash", "pos"],
                    output: "total"
                }]
            };

            const compiled = calculationEngine.compile(dsl);
            const context = { cash: 100, pos: 50 };
            const result = await compiled(context);

            expect(result.total).toBe(150);
        });

        it('should execute SUBTRACT operation', async () => {
            const dsl = {
                version: "1.0",
                steps: [{
                    id: "subtract_step",
                    operation: "SUBTRACT",
                    inputs: ["revenue", "expenses"],
                    output: "profit"
                }]
            };

            const compiled = calculationEngine.compile(dsl);
            const context = { revenue: 1000, expenses: 300 };
            const result = await compiled(context);

            expect(result.profit).toBe(700);
        });

        it('should execute MULTIPLY operation', async () => {
            const dsl = {
                version: "1.0",
                steps: [{
                    id: "multiply_step",
                    operation: "MULTIPLY",
                    inputs: ["quantity", "price"],
                    output: "total"
                }]
            };

            const compiled = calculationEngine.compile(dsl);
            const context = { quantity: 10, price: 5.5 };
            const result = await compiled(context);

            expect(result.total).toBe(55);
        });

        it('should handle DIVIDE operation', async () => {
            const dsl = {
                version: "1.0",
                steps: [{
                    id: "divide_step",
                    operation: "DIVIDE",
                    inputs: ["total", "count"],
                    output: "average"
                }]
            };

            const compiled = calculationEngine.compile(dsl);
            const context = { total: 100, count: 4 };
            const result = await compiled(context);

            expect(result.average).toBe(25);
        });

        it('should handle division by zero', async () => {
            const dsl = {
                version: "1.0",
                steps: [{
                    id: "divide_step",
                    operation: "DIVIDE",
                    inputs: ["total", "count"],
                    output: "average"
                }]
            };

            const compiled = calculationEngine.compile(dsl);
            const context = { total: 100, count: 0 };

            await expect(compiled(context)).rejects.toThrow('Division by zero');
        });
    });

    describe('Complex Calculations', () => {
        it('should chain multiple operations', async () => {
            const dsl = {
                version: "1.0",
                steps: [
                    {
                        id: "step1",
                        operation: "SUM",
                        inputs: ["cash", "pos"],
                        output: "revenue"
                    },
                    {
                        id: "step2",
                        operation: "SUBTRACT",
                        inputs: ["revenue", "expenses"],
                        output: "profit"
                    }
                ]
            };

            const compiled = calculationEngine.compile(dsl);
            const context = { cash: 500, pos: 300, expenses: 200 };
            const result = await compiled(context);

            expect(result.revenue).toBe(800);
            expect(result.profit).toBe(600);
        });

        it('should handle missing inputs gracefully', async () => {
            const dsl = {
                version: "1.0",
                steps: [{
                    id: "sum_step",
                    operation: "SUM",
                    inputs: ["value1", "value2"],
                    output: "total"
                }]
            };

            const compiled = calculationEngine.compile(dsl);
            const context = { value1: 100 }; // value2 mancante

            const result = await compiled(context);
            expect(result.total).toBe(100); // Dovrebbe trattare undefined come 0
        });
    });

    describe('Scope Management', () => {
        it('should cache compiled functions by scope', async () => {
            const mockDsl = {
                version: "1.0",
                steps: [{
                    id: "test",
                    operation: "SUM",
                    inputs: ["a", "b"],
                    output: "result"
                }]
            };

            mockSupabase.setMockData('calculation_modules', [{
                id: 1,
                scope: CALCULATION_SCOPES.CLOSURE,
                active_version_id: 1,
                calculation_versions: [{
                    id: 1,
                    status: 'published',
                    dsl: JSON.stringify(mockDsl)
                }]
            }]);

            // Prima chiamata - deve caricare da DB
            const fn1 = await calculationEngine.getCalculator(CALCULATION_SCOPES.CLOSURE);

            // Seconda chiamata - deve usare cache
            const fn2 = await calculationEngine.getCalculator(CALCULATION_SCOPES.CLOSURE);

            expect(fn1).toBe(fn2); // Stessa istanza
        });

        it('should return null for missing scope', async () => {
            mockSupabase.setMockData('calculation_modules', []);

            const fn = await calculationEngine.getCalculator('NON_EXISTENT_SCOPE');
            expect(fn).toBeNull();
        });
    });
});
