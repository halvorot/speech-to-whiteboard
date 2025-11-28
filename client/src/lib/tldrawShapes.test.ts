import { describe, it, expect } from 'vitest';
import { calculateEdgePoints } from './tldrawShapes';
import type { LayoutNode } from './graphLayout';

describe('tldrawShapes', () => {
  describe('calculateEdgePoints', () => {
    const createNode = (x: number, y: number, width = 200, height = 100): LayoutNode => ({
      id: 'test',
      label: 'Test',
      description: '',
      type: 'server',
      x,
      y,
      width,
      height,
    });

    it('handles horizontal left-to-right edge', () => {
      // Arrange
      const source = createNode(0, 0, 200, 100);
      const target = createNode(300, 0, 200, 100);

      // Act
      const result = calculateEdgePoints(source, target);

      // Assert - should exit right of source, enter left of target
      expect(result.startX).toBeGreaterThan(source.x + source.width / 2);
      expect(result.endX).toBeLessThan(target.x + target.width / 2);
      expect(result.startY).toBeCloseTo(source.y + source.height / 2);
      expect(result.endY).toBeCloseTo(target.y + target.height / 2);
    });

    it('handles horizontal right-to-left edge', () => {
      // Arrange
      const source = createNode(300, 0, 200, 100);
      const target = createNode(0, 0, 200, 100);

      // Act
      const result = calculateEdgePoints(source, target);

      // Assert - should exit left of source, enter right of target
      expect(result.startX).toBeLessThan(source.x + source.width / 2);
      expect(result.endX).toBeGreaterThan(target.x + target.width / 2);
      expect(result.startY).toBeCloseTo(source.y + source.height / 2);
      expect(result.endY).toBeCloseTo(target.y + target.height / 2);
    });

    it('handles vertical top-to-bottom edge', () => {
      // Arrange
      const source = createNode(0, 0, 200, 100);
      const target = createNode(0, 200, 200, 100);

      // Act
      const result = calculateEdgePoints(source, target);

      // Assert - should exit bottom of source, enter top of target
      expect(result.startX).toBeCloseTo(source.x + source.width / 2);
      expect(result.endX).toBeCloseTo(target.x + target.width / 2);
      expect(result.startY).toBeGreaterThan(source.y + source.height / 2);
      expect(result.endY).toBeLessThan(target.y + target.height / 2);
    });

    it('handles vertical bottom-to-top edge', () => {
      // Arrange
      const source = createNode(0, 200, 200, 100);
      const target = createNode(0, 0, 200, 100);

      // Act
      const result = calculateEdgePoints(source, target);

      // Assert - should exit top of source, enter bottom of target
      expect(result.startX).toBeCloseTo(source.x + source.width / 2);
      expect(result.endX).toBeCloseTo(target.x + target.width / 2);
      expect(result.startY).toBeLessThan(source.y + source.height / 2);
      expect(result.endY).toBeGreaterThan(target.y + target.height / 2);
    });

    it('handles diagonal edge bottom-right', () => {
      // Arrange
      const source = createNode(0, 0, 200, 100);
      const target = createNode(300, 200, 200, 100);

      // Act
      const result = calculateEdgePoints(source, target);

      // Assert - edge should point from source to target
      // Start should be toward target from source center
      const sourceCenterX = source.x + source.width / 2;
      const sourceCenterY = source.y + source.height / 2;

      expect(result.startX).toBeGreaterThan(sourceCenterX);
      expect(result.startY).toBeGreaterThan(sourceCenterY - 10); // Allow some tolerance

      // End should be distinct from start
      expect(result.endX).not.toBe(result.startX);
      expect(result.endY).not.toBe(result.startY);
    });

    it('handles same position nodes', () => {
      // Arrange
      const source = createNode(100, 100, 200, 100);
      const target = createNode(100, 100, 200, 100);

      // Act
      const result = calculateEdgePoints(source, target);

      // Assert - should return center points
      expect(result.startX).toBe(200);
      expect(result.startY).toBe(150);
      expect(result.endX).toBe(200);
      expect(result.endY).toBe(150);
    });

    it('respects padding from edges', () => {
      // Arrange
      const source = createNode(0, 0, 200, 100);
      const target = createNode(300, 0, 200, 100);
      const padding = 15;

      // Act
      const result = calculateEdgePoints(source, target);

      // Assert - padding should be applied
      const sourceRightEdge = source.x + source.width;
      const targetLeftEdge = target.x;

      expect(result.startX).toBeLessThan(sourceRightEdge);
      expect(result.endX).toBeGreaterThan(targetLeftEdge);
      expect(result.startX).toBeCloseTo(source.x + source.width / 2 + (source.width / 2 - padding));
    });

    it('handles nodes with different dimensions', () => {
      // Arrange
      const source = createNode(0, 0, 100, 50);
      const target = createNode(200, 100, 300, 150);

      // Act
      const result = calculateEdgePoints(source, target);

      // Assert - should calculate correctly with different sizes
      expect(result.startX).toBeGreaterThanOrEqual(source.x);
      expect(result.startX).toBeLessThanOrEqual(source.x + source.width);
      expect(result.endX).toBeGreaterThanOrEqual(target.x);
      expect(result.endX).toBeLessThanOrEqual(target.x + target.width);
    });
  });
});
