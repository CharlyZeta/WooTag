import { describe, it, expect } from 'vitest';
import { calculateSheetOptimization } from './sheetOptimizer';

describe('sheetOptimizer', () => {
  it('handles 0 labels correctly', () => {
    const result = calculateSheetOptimization(0, 3, 8); // 3 cols x 8 rows = 24
    expect(result.totalLabels).toBe(0);
    expect(result.labelsPerPage).toBe(24);
    expect(result.completedPages).toBe(0);
    expect(result.currentSheetFilled).toBe(0);
    expect(result.remainingToComplete).toBe(24);
    expect(result.totalPages).toBe(0);
    expect(result.progressPercent).toBe(0);
    expect(result.isComplete).toBe(false);
  });

  it('calculates partial sheet correctly (AC-004: 14 labels in 24 capacity)', () => {
    const result = calculateSheetOptimization(14, 3, 8);
    expect(result.totalLabels).toBe(14);
    expect(result.labelsPerPage).toBe(24);
    expect(result.completedPages).toBe(0);
    expect(result.currentSheetFilled).toBe(14);
    expect(result.remainingToComplete).toBe(10);
    expect(result.totalPages).toBe(1);
    expect(result.progressPercent).toBeCloseTo(58.33, 1);
    expect(result.isComplete).toBe(false);
  });

  it('calculates full sheet correctly (AC-005: 24 labels in 24 capacity)', () => {
    const result = calculateSheetOptimization(24, 3, 8);
    expect(result.totalLabels).toBe(24);
    expect(result.labelsPerPage).toBe(24);
    expect(result.completedPages).toBe(1);
    expect(result.currentSheetFilled).toBe(24);
    expect(result.remainingToComplete).toBe(0);
    expect(result.totalPages).toBe(1);
    expect(result.progressPercent).toBe(100);
    expect(result.isComplete).toBe(true);
  });

  it('calculates multiple sheets with overflow (25 labels in 24 capacity)', () => {
    const result = calculateSheetOptimization(25, 3, 8);
    expect(result.totalLabels).toBe(25);
    expect(result.labelsPerPage).toBe(24);
    expect(result.completedPages).toBe(1);
    expect(result.currentSheetFilled).toBe(1);
    expect(result.remainingToComplete).toBe(23);
    expect(result.totalPages).toBe(2);
    expect(result.progressPercent).toBeCloseTo(4.17, 1);
    expect(result.isComplete).toBe(false);
  });

  it('calculates multiple full sheets (48 labels in 24 capacity)', () => {
    const result = calculateSheetOptimization(48, 3, 8);
    expect(result.totalLabels).toBe(48);
    expect(result.labelsPerPage).toBe(24);
    expect(result.completedPages).toBe(2);
    expect(result.currentSheetFilled).toBe(24);
    expect(result.remainingToComplete).toBe(0);
    expect(result.totalPages).toBe(2);
    expect(result.progressPercent).toBe(100);
    expect(result.isComplete).toBe(true);
  });

  it('safely handles non-positive or missing dimensions', () => {
    const result = calculateSheetOptimization(5, 0, 0);
    expect(result.labelsPerPage).toBe(24); // Fallback por defecto
    expect(result.remainingToComplete).toBe(19);
  });
});
